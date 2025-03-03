# mtconnect-ts
[MTConnect's REST protocol](https://model.mtconnect.org/#Package___19_0_4_45f01b9_1637706615628_274120_5004) and digital twin methods in typescript. Perfect for React apps.

**Huge credit to Will Sobel (Chief Architect of MTConnect) for his original work in [cppagent](https://github.com/mtconnect/cppagent).**

This library is born from [MTConnect's reference cppagent's demo.](https://github.com/mtconnect/cppagent/tree/main/demo/twin/lib/mtconnect)

Major changes include:
- translation from JavaScript to TypeScript
- adjustments to enable streaming multiple devices (whereas original presumed single device per instance)

## Install
**Not currently published to npm.**

Add it as a submodule to your project 

`git submodule add https://github.com/processrobotics/mtconnect-ts`

Build it 

`npm run build`

Install locally 

`cd path/to/your/project/root && npm run install ./path/to/submodule`


# Usage
```ts
import { Rest } from "@mx-interface/mtconnect-ts"

const rest = new Rest(`http://${host}`, (values: any) => {
	if (values.length !== 0) {
		const newDevices = rest.devices.map((device: Device) => {
			return device;
		})
		rest.timestamp?setLastUpdate(rest.timestamp):null;
		setDevices(newDevices)
	}
})
```
## Probe
```ts
const probe = await rest.probeMachine();
console.log(probe)
```

