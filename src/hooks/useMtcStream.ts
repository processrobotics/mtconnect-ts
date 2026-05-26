import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Device, Rest } from '..';

type DataItem = {
	id: string;
	component: any;
	value: any;
	machine: boolean;
	coordinateSystemIdRef?: string;
	coordinateSystem?: any;
	motion?: string;
	axis?: THREE.Vector3;
	category?: 'SAMPLE' | 'CONDITION' | 'EVENT';
	type: string;
	subType?: string;
	fixture?: any;
	units?: any;
	resolve: () => void;
	apply: (key: string, data: any) => void;
};

export type DeviceUpdate = {
	timestamp: Date | string;
	sequence: number | string;
};

export function useDeviceStream(initialAgentAddress: string) {
	const [isStreamLoading, setIsStreamLoading] = useState(true);
	const [isDevicesLoaded, setIsDevicesLoaded] = useState(false);
	const [lastUpdate, setLastUpdate] = useState<Record<string, DeviceUpdate>>({});
	// Devices now stored in state so updates trigger re-render for subscribers
	const [devices, setDevices] = useState<Device[]>([]);
	const [agentAddress, setAgentAddress] = useState(initialAgentAddress);
	const [isConnected, setIsConnected] = useState(false);
	const restRef = useRef<Rest>(new Rest(`http://${agentAddress}`, (values: any) => {
		if (values.length !== 0) {
				const newDevices = restRef.current.devices.map((device: Device) => device);
				// Update lastUpdate by device UUID
				const updates: Record<string, DeviceUpdate> = {};
				restRef.current.devices.forEach((device: Device) => {
					device.findDataItems((di: DataItem) => {
						if (di.value?.value != null) {
							if (di.type === 'AVAILABILITY' && di.id === `${device.id}_avail`) {
								di.value?.value === 'AVAILABLE' && (updates[device.uuid] = {
									timestamp: di.value.timestamp || 'Never',
									sequence: di.value.sequence || 0,
								});
							}
						}
						return false;
					});
				});
				setLastUpdate(updates);
				setDevices(newDevices);
			}
		}));

	useEffect(() => {
		console.log("Devices updated", devices);
	}, [devices]);
	
	useEffect(() => {
		console.log(`Agent Address updated: ${agentAddress}`)
	}, [agentAddress])

	useEffect(() => {
		console.log(`Connected: ${isConnected}`)
	}, [isConnected]);

	async function loadAndStream(scene?: THREE.Scene) {
		const probe = await restRef.current.probeMachine();
		console.log(probe);
		if (probe) {
			const loadedDevices = [];
			setIsConnected(true);
			for (let device of probe) {
				const dItems = device.findDataItems(() => true);
				Object.assign(restRef.current.dataItems, Object.fromEntries(dItems.map((di: any) => [di.id, di])));
				if (scene) {
					// Load the device model
					device.load((geo: any) => {
						geo.model.name = geo.component._root.name;
						scene.add(geo.model);
						console.log(`Device loaded: ${geo.model.name}`);
					});

					loadedDevices.push(device);
				}
			}
			setIsDevicesLoaded(true);
			setDevices(loadedDevices); // Update devices with loaded models
			console.log("Devices loaded:", loadedDevices);
			restRef.current.path=``
			await restRef.current.current();
			await restRef.current.streamSample();
			// await restRef.current.streamData(Object.values(restRef.current.dataItems));
			
		}

		restRef.current.path = ``;
		// await rest.current();

		try {
			// await restRef.current.streamData(Object.values(restRef.current.dataItems));
		} catch (e) {
			console.error(e);
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
		rest: restRef.current
	};
}
