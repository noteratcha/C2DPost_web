import glob, os, sys
sys.path.insert(0, os.path.abspath('.'))
from api.core.convert_dpost import process_pdf

pdf_files = sorted(glob.glob('../C2DPost_Python/ไฟล์ตัวอย่าง/**/*.pdf', recursive=True))
print(f'Total test PDFs found: {len(pdf_files)}')
total_records = 0
for f in pdf_files:
    fname = os.path.basename(f)
    folder = os.path.basename(os.path.dirname(f))
    recs = process_pdf(f)
    print(f'  [{folder}/{fname}]: {len(recs)} records')
    total_records += len(recs)
    if fname == '9.pdf':
        r = recs[0]
        print(f'     -> Receiver: {r.get("RECEIVER")}')
        print(f'     -> Address: {r.get("RECEIVER ADDRESS")}')
        print(f'     -> Amphur: {r.get("RECEIVER AMPHUR")}')
        print(f'     -> Province: {r.get("RECEIVER PROVINCE")}')
        print(f'     -> Zip: {r.get("RECEIVER ZIPCODE")}')
        print(f'     -> Ref No: {r.get("REF NO")}')
print(f'SUCCESS! Total records extracted: {total_records}')
