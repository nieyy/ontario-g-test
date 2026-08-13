export function speakInstruction(text: string, enabled: boolean): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'en-CA'
  utterance.rate = 0.92
  window.speechSynthesis.speak(utterance)
}
