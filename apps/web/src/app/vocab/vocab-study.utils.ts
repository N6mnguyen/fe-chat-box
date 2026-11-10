export function normalizeVocabAnswer(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export async function findVocabSpeechVoice(language: 'en' | 'zh'): Promise<SpeechSynthesisVoice | null> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return null;
  }

  const synthesis = window.speechSynthesis;
  let voices = synthesis.getVoices();
  if (!voices.length) {
    voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const finish = () => {
        window.clearTimeout(timeout);
        synthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve(synthesis.getVoices());
      };
      const onVoicesChanged = () => finish();
      const timeout = window.setTimeout(finish, 1200);
      synthesis.addEventListener('voiceschanged', onVoicesChanged, { once: true });
    });
  }

  const languagePrefix = language === 'zh' ? 'zh' : 'en';
  const matchingVoices = voices.filter((voice) => voice.lang.toLocaleLowerCase().startsWith(languagePrefix));
  if (language === 'zh') {
    return matchingVoices.find((voice) => voice.lang.toLocaleLowerCase().startsWith('zh-cn'))
      ?? matchingVoices.find((voice) => voice.lang.toLocaleLowerCase().startsWith('zh-sg'))
      ?? matchingVoices[0]
      ?? null;
  }
  return matchingVoices.find((voice) => voice.lang.toLocaleLowerCase().startsWith('en-us'))
    ?? matchingVoices[0]
    ?? null;
}

export async function playVocabAudioBlob(blob: Blob, playbackRate = 1): Promise<HTMLAudioElement> {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.playbackRate = playbackRate;
  const revokeUrl = () => URL.revokeObjectURL(url);
  audio.addEventListener('ended', revokeUrl, { once: true });
  audio.addEventListener('error', revokeUrl, { once: true });
  try {
    await audio.play();
    return audio;
  } catch (error) {
    revokeUrl();
    throw error;
  }
}
