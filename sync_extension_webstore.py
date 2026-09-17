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
    
    # Target folders
    target_folders = [
        os.path.join(base_dir, 'extension_Webstore'),
        os.path.join(parent_dir, 'extension_Webstore')
    ]
    
    for tf in target_folders:
        os.makedirs(tf, exist_ok=True)
        # 1. Unpacked folder
        unpacked_dir = os.path.join(tf, f"C2DPost_Helper_v{version}_unpacked")
        if os.path.exists(unpacked_dir):
            shutil.rmtree(unpacked_dir)
        shutil.copytree(ext_dir, unpacked_dir)
        
        # 2. Versioned Zip
        zip_path = os.path.join(tf, zip_name)
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
            for root, _, files in os.walk(ext_dir):
                for f in files:
                    full_path = os.path.join(root, f)
                    rel_path = os.path.relpath(full_path, ext_dir)
                    zf.write(full_path, rel_path)
        print(f"Created: {zip_path}")
        
    # Also update public/c2dpost-extension.zip for web direct download
    public_zip = os.path.join(base_dir, 'public', 'c2dpost-extension.zip')
    shutil.copy2(os.path.join(target_folders[0], zip_name), public_zip)
    print(f"Updated public zip: {public_zip}")
    print(f"Successfully synced extension v{version} to extension_Webstore!")

if __name__ == '__main__':
    sync()
