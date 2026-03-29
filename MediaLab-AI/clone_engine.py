import sys
import os
from TTS.api import TTS

# 1. Initialize the Model (Instant Cloning / YourTTS)
# This will download the model weights (~800MB) on the first run
try:
    print("Loading AI Model...", file=sys.stderr)
    tts = TTS(model_name="tts_models/multilingual/multi-dataset/your_tts", progress_bar=False)
except Exception as e:
    print(f"Model Load Error: {e}", file=sys.stderr)
    sys.exit(1)

def run_clone(text, reference_wav, output_wav):
    try:
        # Perform Zero-Shot Cloning
        tts.tts_to_file(
            text=text,
            speaker_wav=reference_wav,
            language="en",
            file_path=output_wav
        )
        return True
    except Exception as e:
        print(f"Cloning Error: {e}", file=sys.stderr)
        return False

if __name__ == "__main__":
    # Expecting: python clone_engine.py "Text" "input.wav" "output.wav"
    if len(sys.argv) < 4:
        print("Usage: python clone_engine.py <text> <reference_wav> <output_wav>", file=sys.stderr)
        sys.exit(1)

    input_text = sys.argv[1]
    ref_audio = sys.argv[2]
    out_audio = sys.argv[3]

    if run_clone(input_text, ref_audio, out_audio):
        print("COMPLETED_SUCCESSFULLY")
        sys.exit(0)
    else:
        sys.exit(1)