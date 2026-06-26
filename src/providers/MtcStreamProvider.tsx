import type React from "react"
import { createContext, useContext, useMemo } from "react"
import type { Rest } from "../MTConnect"
import { useDeviceStream } from "../hooks/useMtcStream"

// Shape of the context value (derive from useDeviceStream return type)
export type DeviceUpdate = {
  timestamp: Date | string
  sequence: number | string
  availability?: "AVAILABLE" | "UNAVAILABLE"
}

export interface MtcStreamContextValue {
  isStreamLoading: boolean
  setIsStreamLoading: (v: boolean) => void
  isDevicesLoaded: boolean
  lastUpdate: Record<string, DeviceUpdate>
  devices: any[] // Could refine with Device[] type import if needed
  agentAddress: string
  setAgentAddress: (addr: string) => void
  isConnected: boolean
  setIsConnected: (v: boolean) => void
  loadAndStream: (scene?: any) => Promise<void>
  rest: Rest // Rest instance
}

const MtcStreamContext = createContext<MtcStreamContextValue | null>(null)

export interface MtcStreamProviderProps {
  children: React.ReactNode
  agentAddress?: string // allow override
}

// Default agent address - fallback to env var exposed via Vite, else localhost
const DEFAULT_AGENT_ADDRESS =
  import.meta.env.VITE_MTC_AGENT_URL || "localhost:5000"

export const MtcStreamProvider: React.FC<MtcStreamProviderProps> = ({
  children,
  agentAddress,
}) => {
  const stream = useDeviceStream(agentAddress || DEFAULT_AGENT_ADDRESS)

  // Memoize to keep stable reference for consumers when internal refs mutate
  const value: MtcStreamContextValue = useMemo(
    () => ({ ...stream }),
    [
      stream.isStreamLoading,
      stream.setIsStreamLoading,
      stream.isDevicesLoaded,
      stream.lastUpdate,
      stream.agentAddress,
      stream.setAgentAddress,
      stream.isConnected,
      stream.setIsConnected,
      stream.devices, // note: devices is a ref.current primitive snapshot from hook
      stream.loadAndStream,
      stream.rest,
    ],
  )

  return (
    <MtcStreamContext.Provider value={value}>
      {children}
    </MtcStreamContext.Provider>
  )
}

export function useMtcStreamContext(): MtcStreamContextValue {
  const ctx = useContext(MtcStreamContext)
  if (!ctx) {
    throw new Error(
      "useMtcStreamContext must be used within an MtcStreamProvider",
    )
  }
  return ctx
}

// Optional helper hook alias with shorter name
export const useMtcStream = useMtcStreamContext
