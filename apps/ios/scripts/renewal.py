#!/usr/bin/env python3
"""Print this repo's paid apps for its renewal scheduler (ios-tools renewal; runs on the Mac mirror)."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--team', required=True)
parser.add_argument('--device', required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
apps = []
# Each provider's prepared Web bundle is an input; the shared Resources/Web staging folder is an output.
for provider, product in json.loads((root / 'providers.json').read_text()).items():
    apps.append(dict(name=provider, root=str(root),
                     app='build/' + provider + '/native/Release-iphoneos/' + product['name'] + '.app',
                     bundleIds=[product['bundleId']],
                     inputs=['GalleryReader', 'GalleryReader.xcodeproj', 'Resources/Info.plist',
                             'Resources/LocalCA.cer', 'providers.json', 'build/' + provider + '/Web',
                             'build/' + provider + '/provider.xcconfig', 'scripts/build.sh', 'scripts/build-provider.py'],
                     build=['/bin/bash', 'scripts/build.sh', provider],
                     environment={'DEVELOPMENT_TEAM': args.team, 'SIGNING_DEVICE': args.device}))
print(json.dumps(dict(repo='gallery-reader', apps=apps)))
