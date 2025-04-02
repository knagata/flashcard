import csv, json

# 入力CSVファイルと出力JSONファイルのパスを設定
input_csv = 'step1.csv'
output_json = 'step1.json'

data = []
with open(input_csv, newline='', encoding='utf-8') as csvfile:
    reader = csv.reader(csvfile)
    for i, row in enumerate(reader):
        # row の内容が [単語, 拼音, 意味, 例文, 例文拼音, 例文意味] の順である前提
        entry = {
            "number": i+1,
            "word": row[0],
            "pinyin": row[1],
            "meaning": row[2],
            "example": {
                "text": row[3],
                "pinyin": row[4],
                "translation": row[5]
            }
        }
        data.append(entry)

with open(output_json, 'w', encoding='utf-8') as jsonfile:
    json.dump(data, jsonfile, ensure_ascii=False, indent=2)

print(f"{output_json} が作成されました。")