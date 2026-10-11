#!/usr/bin/env python3
"""Build exactly one provider, sharing the suite's signing lock (SIMULATOR=1: an unsigned
simulator build in build/<provider>/native/Release-iphonesimulator, no lock)."""
import fcntl,json,os,pathlib,subprocess,sys
root=pathlib.Path(__file__).resolve().parents[1]
providers=json.loads((root/'providers.json').read_text())
if len(sys.argv)!=2 or sys.argv[1] not in providers: raise SystemExit('Supply exactly one provider: hitomi or imhentai')
provider=sys.argv[1]
common=['xcodebuild','-project','GalleryReader.xcodeproj','-scheme','GalleryReader','-configuration','Release',
        '-xcconfig',str(root/'build'/provider/'provider.xcconfig'),'SYMROOT='+str(root/'build'/provider/'native'),
        '-derivedDataPath',str(root/'build'/provider/'DerivedData')]
if os.environ.get('SIMULATOR'):
    subprocess.run(common+['-sdk','iphonesimulator','-destination','generic/platform=iOS Simulator','CODE_SIGNING_ALLOWED=NO','build'],cwd=root,check=True)
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
    subprocess.run(common+['-sdk','iphoneos','-destination','platform=iOS,id='+device,'-destination-timeout','30',
        'DEVELOPMENT_TEAM='+team,'-allowProvisioningUpdates','-allowProvisioningDeviceRegistration','build'],cwd=root,check=True)
