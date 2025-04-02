from pydub import AudioSegment, silence
import os
import subprocess
from pathlib import Path

def generate_split_script(mp3_path, output_script_path):
    mp3_path = Path(mp3_path)
    n = int(mp3_path.stem)  # ファイル名から数値部分を取得

    audio = AudioSegment.from_mp3(mp3_path)
    silence_thresh = audio.dBFS - 15  # より厳しいしきい値に変更
    min_silence_len = 1200

    silent_ranges = silence.detect_silence(
        audio,
        min_silence_len=min_silence_len,
        silence_thresh=silence_thresh
    )

    # 無音区間の末尾から開始（冒頭無音をスキップ）
    if silent_ranges and silent_ranges[0][0] == 0:
        first_voice_start = silent_ranges[0][1]
    else:
        first_voice_start = 0

    segment_start_times = [first_voice_start] + [end for _, end in silent_ranges if end > first_voice_start]
    adjusted_start_times = [max(0, ms - 200) for ms in segment_start_times]  # 200ms早める（負値を避ける）
    segment_end_times = adjusted_start_times[1:] + [len(audio)]

    # 一般化された処理: 各単語につき4セグメント → 単語数を推定
    num_total_segments = min(len(adjusted_start_times), len(segment_end_times))
    num_words = num_total_segments // 4

    kept_segments = [
        (i + 1, adjusted_start_times[i], segment_end_times[i])
        for i in range(num_words * 4)
        if i % 4 in (0, 3)
    ]

    output_dir = Path("output")
    output_dir.mkdir(exist_ok=True)

    commands = []
    for new_index, (seg_num, start_ms, end_ms) in enumerate(kept_segments, start=1):
        k = (new_index + 1) // 2
        label_type = "word" if new_index % 2 == 1 else "phrase"
        label = f"{(n - 1) * 9 + k}_{label_type}"
        start_sec = start_ms / 1000
        duration_sec = (end_ms - start_ms) / 1000
        output_filename = output_dir / f"{label}.mp3"
        cmd = [
            "ffmpeg",
            "-y",  # 上書きオプション
            "-i", str(mp3_path.name),
            "-ss", f"{start_sec:.3f}",
            "-t", f"{duration_sec:.3f}",
            "-c", "copy",
            str(output_filename)
        ]
        commands.append(cmd)

    for cmd in commands:
        print("実行中:", " ".join(cmd))
        subprocess.run(cmd)

    print(f"✅ 分割完了: {mp3_path.name}")

if __name__ == "__main__":
    current_dir = Path(".")
    mp3_files = sorted(current_dir.glob("[0-9][0-9][0-9].mp3"))
    for mp3_file in mp3_files:
        generate_split_script(mp3_file, f"split_{mp3_file.stem}.sh")
