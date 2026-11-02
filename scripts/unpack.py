"""Verify stored and logical SHA-256; unpack exact evaluated logical bytes."""
from pathlib import Path
import argparse, gzip, hashlib, json
ROOT=Path(__file__).resolve().parents[1]
def digest(b):return hashlib.sha256(b).hexdigest()
def safe_path(root,name):
 path=root/name
 if not path.resolve().is_relative_to(root.resolve()):raise ValueError(f'Path escapes artifact: {name}')
 return path
def read_payload(root,item):
 """Accept original single-file manifests and ordered multipart payloads."""
 if 'storedParts' in item:
  chunks=[]
  if not item['storedParts']:raise ValueError('Empty multipart payload')
  for part in item['storedParts']:
   path=safe_path(root,part['path']);chunk=path.read_bytes()
   if len(chunk)!=part['bytes'] or digest(chunk)!=part['sha256']:raise ValueError(f'Part checksum/length mismatch: {path}')
   chunks.append(chunk)
  raw=b''.join(chunks)
 else:raw=safe_path(root,item['storedPath']).read_bytes()
 if len(raw)!=item['storedBytes'] or digest(raw)!=item['storedSha256']:raise ValueError(f'Stored payload checksum/length mismatch: {item["path"]}')
 return raw
def main():
 p=argparse.ArgumentParser();p.add_argument('--verify-only',action='store_true');a=p.parse_args()
 manifest=json.loads((ROOT/'ARTIFACT-MANIFEST.json').read_text())
 for item in manifest['files']:
  logical=safe_path(ROOT,item['path']);raw=read_payload(ROOT,item)
  data=gzip.decompress(raw) if item['compression']=='gzip' else raw
  if len(data)!=item['bytes'] or digest(data)!=item['sha256']:raise ValueError(f'Logical checksum/length mismatch: {logical}')
  if not a.verify_only and item['compression']=='gzip':
   logical.parent.mkdir(parents=True,exist_ok=True);logical.write_bytes(data)
 print('Verified',len(manifest['files']),'logical files; exact logical SHA-256 matches')
if __name__=='__main__':main()
