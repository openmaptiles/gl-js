// When Rollup builds the main bundle this file is replaced with ./build/web_worker_replacement.js
// See package.json 'browser' field and rollup documentation.
// This file is intended for use in the GL-JS test suite when they run on node since node doesn't support workers.
// It implements a MessageBus main thread interface

import MaplibreWorker from '../source/worker';

import type {WorkerSource} from '../source/worker_source';

type MessageListener = (
    a: {
        data: any,
        target: any
    }
) => unknown;

// The main thread interface. Provided by Worker in a browser environment,
// and MessageBus below in a node environment.
export interface WorkerInterface {
    addEventListener(type: "message", listener: MessageListener): void;
    removeEventListener(type: "message", listener: MessageListener): void;
    postMessage(message: any): void;
    terminate(): void;
}

export interface WorkerGlobalScopeInterface {
    importScripts(...urls: Array<string>): void;
    registerWorkerSource: (
        b: string,
        a: {
            new(...args: any): WorkerSource
        }
    ) => void;
    registerRTLTextPlugin: (_: any) => void;
}

class MessageBus implements WorkerInterface, WorkerGlobalScopeInterface {
    addListeners: Array<MessageListener>;
    postListeners: Array<MessageListener>;
    target: MessageBus;
    registerWorkerSource: any;
    registerRTLTextPlugin: any;

    constructor(addListeners: Array<MessageListener>, postListeners: Array<MessageListener>) {
        this.addListeners = addListeners;
        this.postListeners = postListeners;
    }

    addEventListener(event: "message", callback: MessageListener) {
        if (event === 'message') {
            this.addListeners.push(callback);
        }
    }

    removeEventListener(event: "message", callback: MessageListener) {
        const i = this.addListeners.indexOf(callback);
        if (i >= 0) {
            this.addListeners.splice(i, 1);
        }
    }

    postMessage(data: any) {
        setImmediate(() => {
            try {
                for (const listener of this.postListeners) {
                    listener({data, target: this.target});
                }
            } catch (e) {
                console.error(e);
            }
        });
    }

    terminate() {
        this.addListeners.splice(0, this.addListeners.length);
        this.postListeners.splice(0, this.postListeners.length);
    }

    importScripts() { }
}

export default function workerFactory(): WorkerInterface {
    const parentListeners = [],
        workerListeners = [],
        parentBus = new MessageBus(workerListeners, parentListeners),
        workerBus = new MessageBus(parentListeners, workerListeners);

    parentBus.target = workerBus;
    workerBus.target = parentBus;

    new workerFactory.Worker(workerBus);

    return parentBus;
}

// expose to allow stubbing in unit tests
workerFactory.Worker = MaplibreWorker;
