export type RoadAmbience = {
  resume: () => Promise<void>
  update: (speedKph: number, active: boolean) => void
  dispose: () => void
}

export function roadAmbienceGain(speedKph: number, active: boolean) {
  if (!active || speedKph < 1) return 0
  return 0.008 + Math.min(1, speedKph / 100) * 0.018
}

export function createRoadAmbience(): RoadAmbience | null {
  if (typeof window === 'undefined') return null
  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) return null

  const context = new AudioContextConstructor()
  const master = context.createGain()
  const filter = context.createBiquadFilter()
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1

  const noise = context.createBufferSource()
  noise.buffer = buffer
  noise.loop = true
  filter.type = 'lowpass'
  filter.frequency.value = 420
  filter.Q.value = 0.45
  master.gain.value = 0
  noise.connect(filter)
  filter.connect(master)
  master.connect(context.destination)
  noise.start()

  return {
    resume: () => context.state === 'suspended' ? context.resume() : Promise.resolve(),
    update: (speedKph, active) => {
      const now = context.currentTime
      master.gain.setTargetAtTime(roadAmbienceGain(speedKph, active), now, 0.22)
      filter.frequency.setTargetAtTime(300 + Math.min(120, speedKph) * 5.5, now, 0.3)
    },
    dispose: () => {
      noise.stop()
      noise.disconnect()
      filter.disconnect()
      master.disconnect()
      void context.close()
    },
  }
}
