import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { Rest } from '../src/MTConnect';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('demo'));

app.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Buffer to store the last 25 lines
    const outputBuffer: string[] = [];
    const MAX_LINES = 100;

    const addToBuffer = (line: string) => {
        outputBuffer.push(line);
        if (outputBuffer.length > MAX_LINES) {
            outputBuffer.shift(); // Remove oldest line
        }
        res.write(`data: ${line}\n\n`);
    };

    const sendProbeData = (data: any) => {
        // Send device info for probe data
        if (data && typeof data === 'object' && data.id) {
            const deviceInfo = {
                type: 'probe-device',
                id: data.id,
                name: data.name,
                deviceType: data.type,
                uuid: data.uuid
            };
            addToBuffer(JSON.stringify(deviceInfo));
            
            // Then send each dataItem for probe data
            if (data._entities) {
                Object.values(data._entities)
                    .filter((entity: any) => entity.category) // DataItems have category
                    .forEach((dataItem: any) => {
                        const serializableDataItem = {
                            type: 'probe-dataItem',
                            id: dataItem.id,
                            name: dataItem.name,
                            dataType: dataItem.type,
                            category: dataItem.category,
                            value: dataItem.value,
                            units: dataItem.units,
                            deviceId: data.id,
                            deviceName: data.name
                        };
                        addToBuffer(JSON.stringify(serializableDataItem));
                    });
            }
        }
    };

    async function loadAndStream(host = process.argv[2] || 'localhost:5000') {
        const rest = new Rest(`http://${host}`, (values) => {
            if (values.length !== 0) {
                values.forEach((item) => {
					console.log(item); // Debug log
                    // Check if this is a DataItem object (first item) or observation data (second item)
                    if (item && typeof item === 'object' && item.id && item.category) {
                        // This is a DataItem object
                        const dataItem = item;
                        const serializableDataItem = {
                            type: 'dataItem',
                            id: dataItem.id,
                            name: dataItem.name,
                            dataType: dataItem.type,
                            category: dataItem.category,
                            value: dataItem.value?.value || dataItem.value,
                            units: dataItem.units,
                            timestamp: dataItem.value?.timestamp || new Date().toISOString(),
                            sequence: dataItem.value?.sequence,
                            deviceId: dataItem.component?.parent?.id || 'unknown',
                            deviceName: dataItem.component?.parent?.name || 'unknown'
                        };
                        addToBuffer(JSON.stringify(serializableDataItem));
                    } else if (item && typeof item === 'object' && item[0].id) {
						console.log('Item data: ', item); // Debug log
                        // This is observation data - we can use it to update the DataItem
                        const observation = item[1];
						console.log('Observation data: ', observation); // Debug log
                        const serializableObservation = {
                            type: 'observation',
                            dataItemId: observation.dataItemId,
                            value: observation.value,
                            timestamp: observation.timestamp,
                            sequence: observation.sequence,
                            subType: observation.subType
                        };
                        addToBuffer(JSON.stringify(serializableObservation));
                    }
					
                });
            } else {
                // Send empty data when no values received
				const serializableEmpty = {
					type: 'empty',
					message: 'No New Data',
					timestamp: new Date().toISOString()
				};
                addToBuffer(JSON.stringify(serializableEmpty));
            }
        })
        const probe = await rest.probeMachine();

        console.log(probe)
        if (probe) {
            rest.dataItems = {};
            for (let device of probe) {
                sendProbeData(device); // Use sendProbeData for static probe data
                const dItems = device.findDataItems(() => true);
                Object.assign(rest.dataItems, Object.fromEntries(dItems.map(di => [di.id, di])));
            }
        }
        rest.path = ``;
        await rest.current();
        try {
            await rest.streamSample();
        }
        catch (e) {
            console.error(e);
        }
        // await rest.streamSample();
    }
	
	// Start the streaming
	loadAndStream().catch(console.error);
});

server.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});