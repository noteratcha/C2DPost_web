# -*- coding: utf-8 -*-
"""
sync_extension_webstore.py
Utility script to package and synchronize extension files into extension_Webstore and public directories.
"""
import os
import json
import zipfile
import shutil

def sync():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    ext_dir = os.path.join(base_dir, 'extension')
    parent_dir = os.path.dirname(base_dir)
    
    # Read current manifest version
    with open(os.path.join(ext_dir, 'manifest.json'), 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    version = manifest.get('version', '1.0.0')
    zip_name = f"C2DPost_Helper_v{version}_WebStore.zip"
    
    print(f"Packaging Extension version {version}...")
    
    # Target folder (Only inside C2DPost_web to prevent duplicate folders)
    tf = os.path.join(base_dir, 'extension_Webstore')
    os.makedirs(tf, exist_ok=True)
    
    # Versioned Zip in extension_Webstore for Chrome Web Store Developer Console upload
    zip_path = os.path.join(tf, zip_name)
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(ext_dir):
            for f in files:
                if f.lower() in ('desktop.ini', 'thumbs.db') or f.endswith('.ini'):
                    continue
                full_path = os.path.join(root, f)
                rel_path = os.path.relpath(full_path, ext_dir)
                if f == 'manifest.json':
                    # Web Store build: strip "key" so Chrome Web Store manages the extension ID/key itself
                    with open(full_path, 'r', encoding='utf-8') as mf:
                        manifest_data = json.load(mf)
                    manifest_data.pop('key', None)
                    zf.writestr(rel_path, json.dumps(manifest_data, indent=2, ensure_ascii=False))
                else:
                    zf.write(full_path, rel_path)
    print(f"Created: {zip_path}")
    
    # 3. Clean up obsolete zip files in extension_Webstore
    for f in os.listdir(tf):
        if f.endswith('_WebStore.zip') and f != zip_name:
            try:
                os.remove(os.path.join(tf, f))
                print(f"Removed obsolete zip: {f}")
            except Exception:
                pass
        
    # 4. Also update public/ directory for direct web download
    public_dir = os.path.join(base_dir, 'public')
    shutil.copy2(zip_path, os.path.join(public_dir, zip_name))
    shutil.copy2(zip_path, os.path.join(public_dir, 'c2dpost-extension.zip'))
    
    # Clean up obsolete zip files in public
    for f in os.listdir(public_dir):
        if f.startswith('C2DPost_Helper_v') and f.endswith('_WebStore.zip') and f != zip_name:
            try:
                os.remove(os.path.join(public_dir, f))
                print(f"Removed obsolete public zip: {f}")
            except Exception:
                pass
                
    print(f"Successfully synced extension v{version} cleanly without duplicates!")

if __name__ == '__main__':
    sync()
