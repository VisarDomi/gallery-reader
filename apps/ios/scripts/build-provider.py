#!/usr/bin/env python3
"""Build exactly one provider, sharing the suite's signing lock (SIMULATOR=1: an unsigned
simulator build in build/<provider>/native/Release-iphonesimulator, no lock).

Both providers compile the same target under one module name (PRODUCT_MODULE_NAME = GalleryReader
in the project) in build/shared/DerivedData and build/shared/native, so the second provider reuses
the first one's compiled module; the finished bundle is cloned to build/<provider>/native."""
import fcntl,json,os,pathlib,shutil,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[1]
if not os.environ.get('IOS_WORKLOAD_ACTIVE'):
    guard=pathlib.Path.home()/'Developer/ios-tools/native/scripts/mac-workload'
    os.execv(sys.executable,[sys.executable,str(guard),'build','--timeout','900','--',sys.executable,str(pathlib.Path(__file__).resolve()),*sys.argv[1:]])
providers=json.loads((root/'providers.json').read_text())
if len(sys.argv)!=2 or sys.argv[1] not in providers: raise SystemExit('Supply exactly one provider: hitomi or imhentai')
provider=sys.argv[1]
shared=root/'build'/'shared'
def publish(platform):
    # Clone (APFS copy-on-write) the shared product to the provider's own output path.
    name=providers[provider]['name']+'.app'
    built=shared/'native'/('Release-'+platform)/name
    app=root/'build'/provider/'native'/('Release-'+platform)/name
    app.parent.mkdir(parents=True,exist_ok=True)
    staging=app.with_name(app.name+'.publishing')
    if staging.exists(): shutil.rmtree(staging)
    subprocess.run(['/bin/cp','-cR',str(built),str(staging)],check=True)
    if app.exists(): shutil.rmtree(app)
    staging.rename(app)
common=['xcodebuild','-jobs','2','-project','GalleryReader.xcodeproj','-scheme','GalleryReader','-configuration','Release',
        '-xcconfig',str(root/'build'/provider/'provider.xcconfig'),'SYMROOT='+str(shared/'native'),
        '-derivedDataPath',str(shared/'DerivedData')]
if os.environ.get('SIMULATOR'):
    subprocess.run(common+['-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','CODE_SIGNING_ALLOWED=NO','build'],cwd=root,check=True)
    publish('iphonesimulator')
    raise SystemExit(0)
lockpath=pathlib.Path.home()/'Library/Caches/ios-app-refresh/signing.lock'
lockpath.parent.mkdir(parents=True,exist_ok=True)
with lockpath.open('a') as lock:
    inherited=os.environ.get('IOS_REFRESH_LOCK_FD')
    if inherited:
        expected=lockpath.stat();actual=os.fstat(int(inherited))
        if (actual.st_dev,actual.st_ino)!=(expected.st_dev,expected.st_ino): raise SystemExit('Invalid inherited signing lock')
    else: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    team=os.environ['DEVELOPMENT_TEAM'];device=os.environ['SIGNING_DEVICE']
    subprocess.run(common+['-sdk','iphoneos','-destination',os.environ.get('SIGNING_DESTINATION') or 'platform=iOS,id='+device,'-destination-timeout','30',
        'DEVELOPMENT_TEAM='+team,'-allowProvisioningUpdates','-allowProvisioningDeviceRegistration','build'],cwd=root,check=True)
    publish('iphoneos')
