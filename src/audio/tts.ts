import { execFileSync } from "node:child_process";

export interface SpeechSynthesizer {
  synthesize(text: string, outWavPath: string): void;
}

export const saySynthesizer: SpeechSynthesizer = {
  synthesize(text, outWavPath) {
    const aiff = outWavPath.replace(/\.wav$/, ".aiff");
    execFileSync("say", ["-v", "Daniel", "-o", aiff, text]);
    execFileSync("ffmpeg", ["-y", "-i", aiff, "-ar", "44100", "-ac", "2", outWavPath], { stdio: "ignore" });
  },
};
