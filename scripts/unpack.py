"""Verify stored and logical SHA-256; unpack exact evaluated logical bytes."""
from pathlib import Path
import argparse, gzip, hashlib, json
ROOT=Path(__file__).resolve().parents[1]
def digest(b):return hashlib.sha256(b).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--verify-only',action='store_true');a=p.parse_args()
 manifest=json.loads((ROOT/'ARTIFACT-MANIFEST.json').read_text())
 for item in manifest['files']:
  logical=ROOT/item['path'];stored=ROOT/item['storedPath']
  assert logical.resolve().is_relative_to(ROOT) and stored.resolve().is_relative_to(ROOT)
  raw=stored.read_bytes();assert digest(raw)==item['storedSha256'],stored
  data=gzip.decompress(raw) if item['compression']=='gzip' else raw
  assert len(data)==item['bytes'] and digest(data)==item['sha256'],logical
  if not a.verify_only and item['compression']=='gzip':
   logical.parent.mkdir(parents=True,exist_ok=True);logical.write_bytes(data)
 print('Verified',len(manifest['files']),'logical files; exact logical SHA-256 matches')
if __name__=='__main__':main()
