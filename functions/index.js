/**
* Import function triggers from their respective submodules:
*
* const {onCall} = require("firebase-functions/v2/https");
* const {onDocumentWritten} = require("firebase-functions/v2/firestore");
*
* See a full list of supported triggers at https://firebase.google.com/docs/functions
*/

import {onRequest} from "firebase-functions/v2/https";
import {logger} from "firebase-functions";
import {JSONRPCServer} from "json-rpc-2.0";
import WebSocket from "ws";
Object.assign(global, { WebSocket });
import Connection from "flespi-io-js/dist/node.js";

// Initialize Flespi Client
const flespiClient = new Connection({
    token: `FlespiToken ${process.env.FLESPI_TOKEN}`,
    socketConfig: {
        server: `wss://mqtt.flespi.io`,
        clientId: "flespi-functions",
    },
});

flespiClient.socket.on("reconnect", () => { logger.warn("trying to reconnect"); });
flespiClient.socket.on("close", () => { logger.warn("connection closes"); });
flespiClient.socket.on("offline", () => { logger.warn("connection offline"); });
flespiClient.socket.on("error", () => { logger.error("connection error"); });
flespiClient.socket.on("connect", () => { logger.info("connection connected"); });

// JSON-RPC Server
const rpcServer = new JSONRPCServer();

// **Dynamically Expose Flespi Methods**
const flespiMethods = [
    "http.gw.channels.get",
    "http.gw.channels.messages.get",
    "http.gw.channels.logs.get",
    "http.gw.devices.get",
    "http.gw.devices.messages.get",
    "http.gw.devices.logs.get",
    "http.gw.devices.telemetry.get",
    "http.gw.devices.settings.put",
    "http.gw.devices.settings.post",
]; // Add more as needed

flespiMethods.forEach((method) => {
    rpcServer.addMethod(method, async (params) => {
        try {
            const methodParts = method.split("."); // Split method name by dot
            let target = flespiClient;
            
            // Traverse the object tree to get the actual function
            for (let part of methodParts) {
                if (!target[part])
                    throw new Error(`Method '${method}' not found in flespi-io-js`);
                target = target[part];
            }
            
            if (typeof target !== "function")
                throw new Error(`'${method}' is not a function`);
            const resp = await target(...params);
            return resp.data.result;
        } catch (err) {
            throw new Error(`Error processing '${method}': ${err.message}`);
        }
    });
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

export const rpcHandler = onRequest(async (request, response) => {
    logger.info("RPC request received", request.body);
    const jsonRPCResponse = await rpcServer.receive(request.body);
    response.json(jsonRPCResponse);
});
