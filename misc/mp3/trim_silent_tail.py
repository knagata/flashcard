from pydub import AudioSegment, silence
from pathlib import Path

# 出力フォルダとファイルを指定
input_dir = Path("output")
output_dir = Path("output_trimmed")
output_dir.mkdir(exist_ok=True)

# トリミング設定
min_silence_len = 300       # 無音とみなす長さ（ms）
silence_thresh_padding = 20 # dBFS基準値の何dB下を無音とみなすか
buffer_after_silence = 200  # 無音検出の終わりからどれだけ後ろに残すか（ms）

for file in input_dir.glob("*.mp3"):
    audio = AudioSegment.from_mp3(file)
    silence_thresh = audio.dBFS - silence_thresh_padding

    print(f"\n🔍 処理中: {file.name}")
    print(f"   音声長さ: {len(audio)}ms, dBFS: {audio.dBFS:.2f}, 無音しきい値: {silence_thresh:.2f}")

    reversed_audio = audio.reverse()
    silent_ranges = silence.detect_silence(
        reversed_audio,
        min_silence_len=min_silence_len,
        silence_thresh=silence_thresh
    )

    if silent_ranges:
        silent_end_in_reversed = silent_ranges[0][1]  # 無音の終わり（逆再生中）
        trim_point = len(audio) - max(0, silent_end_in_reversed - buffer_after_silence)
        trimmed = audio[:trim_point]
        print(f"   無音検出: {silent_ranges[0]} → トリム位置: {trim_point}ms")
        print(f"   トリム後長さ: {len(trimmed)}ms")
    else:
        trimmed = audio
        print("   無音検出されず（トリミングなし）")

    output_path = output_dir / file.name
    trimmed.export(output_path, format="mp3")
    print(f"✅ 出力完了: {output_path}")
