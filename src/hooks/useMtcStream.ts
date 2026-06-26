import { useEffect, useRef, useState } from "react"
import type * as THREE from "three"
import { type Device, Rest } from ".."

type DataItem = {
  id: string
  component: any
  value: any
  machine: boolean
  coordinateSystemIdRef?: string
  coordinateSystem?: any
  motion?: string
  axis?: THREE.Vector3
  category?: "SAMPLE" | "CONDITION" | "EVENT"
  type: string
  subType?: string
  fixture?: any
  units?: any
  resolve: () => void
  apply: (key: string, data: any) => void
}

export type DeviceUpdate = {
  timestamp: Date | string
  sequence: number | string
  availability?: "AVAILABLE" | "UNAVAILABLE"
}

const toTimeMs = (timestamp: Date | string): number => {
  const ms = new Date(timestamp).getTime()
  return Number.isNaN(ms) ? -1 : ms
}

const normalizeAvailability = (
  value: unknown,
): "AVAILABLE" | "UNAVAILABLE" | undefined => {
  const normalized = String(value ?? "").toUpperCase()
  if (normalized === "AVAILABLE" || normalized === "UNAVAILABLE") {
    return normalized
  }
  return undefined
}

const isNewerUpdate = (current: DeviceUpdate, candidate: DeviceUpdate) => {
  const currentMs = toTimeMs(current.timestamp)
  const candidateMs = toTimeMs(candidate.timestamp)
  if (candidateMs !== currentMs) {
    return candidateMs > currentMs
  }
  const currentSeq = Number(current.sequence)
  const candidateSeq = Number(candidate.sequence)
  if (Number.isNaN(candidateSeq)) return false
  if (Number.isNaN(currentSeq)) return true
  return candidateSeq > currentSeq
}

export function useDeviceStream(initialAgentAddress: string) {
  const [isStreamLoading, setIsStreamLoading] = useState(true)
  const [isDevicesLoaded, setIsDevicesLoaded] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Record<string, DeviceUpdate>>({})
  // Devices now stored in state so updates trigger re-render for subscribers
  const [devices, setDevices] = useState<Device[]>([])
  const [agentAddress, setAgentAddress] = useState(initialAgentAddress)
  const [isConnected, setIsConnected] = useState(false)
  const restRef = useRef<Rest>(
    new Rest(`http://${agentAddress}`, (values: any) => {
      if (values.length !== 0) {
        const newDevices = restRef.current.devices.map(
          (device: Device) => device,
        )
        setLastUpdate((previous) => {
          const merged = { ...previous }
          values.forEach(([di, obs]: [DataItem, any]) => {
            const deviceUuid = di?.component?.root?.uuid
            if (!deviceUuid || !obs?.timestamp) return

            const existing = merged[deviceUuid]
            const availability =
              di?.type === "AVAILABILITY"
                ? normalizeAvailability(obs?.value)
                : undefined
            const candidate: DeviceUpdate = {
              timestamp: obs.timestamp,
              sequence: obs.sequence ?? 0,
              availability: availability ?? existing?.availability,
            }

            if (!existing || isNewerUpdate(existing, candidate)) {
              merged[deviceUuid] = candidate
            } else if (availability && existing.availability !== availability) {
              merged[deviceUuid] = {
                ...existing,
                availability,
              }
            }
          })
          return merged
        })
        setDevices(newDevices)
      }
    }),
  )

  useEffect(() => {
    console.log("Devices updated", devices)
  }, [devices])

  useEffect(() => {
    console.log(`Agent Address updated: ${agentAddress}`)
  }, [agentAddress])

  useEffect(() => {
    console.log(`Connected: ${isConnected}`)
  }, [isConnected])

  async function loadAndStream(scene?: THREE.Scene) {
    const probe = await restRef.current.probeMachine()
    console.log(probe)
    if (probe) {
      const loadedDevices = []
      setIsConnected(true)
      for (const device of probe) {
        const dItems = device.findDataItems(() => true)
        Object.assign(
          restRef.current.dataItems,
          Object.fromEntries(dItems.map((di: any) => [di.id, di])),
        )
        if (scene) {
          // Load the device model
          device.load((geo: any) => {
            geo.model.name = geo.component._root.name
            scene.add(geo.model)
            console.log(`Device loaded: ${geo.model.name}`)
          })

          loadedDevices.push(device)
        }
      }
      setIsDevicesLoaded(true)
      setDevices(loadedDevices) // Update devices with loaded models
      console.log("Devices loaded:", loadedDevices)
      restRef.current.path = ""
      await restRef.current.current()
      await restRef.current.streamSample()
      // await restRef.current.streamData(Object.values(restRef.current.dataItems));
    }

    restRef.current.path = ""
    // await rest.current();

    try {
      // await restRef.current.streamData(Object.values(restRef.current.dataItems));
    } catch (e) {
      console.error(e)
    }
  }

  return {
    isStreamLoading,
    setIsStreamLoading,
    isDevicesLoaded,
    lastUpdate,
    devices,
    agentAddress,
    setAgentAddress,
    isConnected,
    setIsConnected,
    loadAndStream,
    rest: restRef.current,
  }
}
