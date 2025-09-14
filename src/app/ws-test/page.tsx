
"use client";

import { useState } from 'react';
import { useAuth } from '@/components/providers/auth-provider';

const WebSocketTestPage = () => {
    const { user } = useAuth();
    const [logs, setLogs] = useState<string[]>([]);
    const [connectionStatus, setConnectionStatus] = useState('idle');

    const addLog = (log: string) => {
        console.log(log);
        setLogs(prev => [...prev, `${new Date().toISOString()}: ${log}`]);
    };

    const runTest = async () => {
        addLog('--- Starting WebSocket Connection Test ---');
        setConnectionStatus('testing');

        if (!user) {
            addLog('FAIL: User not authenticated. Cannot get ID token.');
            setConnectionStatus('failed');
            return;
        }
        addLog('SUCCESS: User is authenticated.');

        let token;
        try {
            addLog('Attempting to get user ID token...');
            token = await user.getIdToken();
            addLog(`SUCCESS: Got ID token (first 10 chars): ${token.substring(0, 10)}...`);
        } catch (error: any) {
            addLog(`FAIL: Could not get ID token. Error: ${error.message}`);
            setConnectionStatus('failed');
            return;
        }

        // --- DIAGNOSTIC CHANGE: Bypassing proxy ---
        const wsBaseUrl = "wss://livevoicepipeline-m7rijrszka-uc.a.run.app";
        addLog(`INFO: Using direct connection URL for diagnostics: ${wsBaseUrl}`);

        const websocketUrl = `${wsBaseUrl}?token=${token}`;
        addLog(`Attempting to connect to: ${websocketUrl}`);

        try {
            const socket = new WebSocket(websocketUrl);
            
            socket.onopen = () => {
                addLog('EVENT: onopen - WebSocket connection established successfully!');
                setConnectionStatus('success');
                socket.close(1000, 'Test complete.');
            };

            socket.onmessage = (event) => {
                addLog(`EVENT: onmessage - Received message: ${event.data}`);
            };

            socket.onerror = (event) => {
                addLog('EVENT: onerror - A WebSocket error occurred. This is often followed by onclose.');
                console.error('WebSocket error event:', event);
            };

            socket.onclose = (event) => {
                addLog(`EVENT: onclose - WebSocket connection closed. Code: ${event.code}, Reason: "${event.reason}", Was clean: ${event.wasClean}`);
                if (!event.wasClean) {
                    addLog('FAIL: The connection closed unexpectedly. Check the server logs and browser console for more details.');
                    setConnectionStatus('failed');
                } else if (connectionStatus !== 'success') {
                     addLog('INFO: Connection closed before onopen was fired.');
                }
            };

        } catch (error: any) {
            addLog(`FAIL: An error occurred when trying to create the WebSocket. Error: ${error.message}`);
            setConnectionStatus('failed');
        }
    };

    return (
        <div style={{ padding: '20px', fontFamily: 'monospace', color: '#333' }}>
            <h1>WebSocket Connection Test</h1>
            <p>This page will attempt to establish a WebSocket connection to the backend and log the results.</p>
            <p>You must be logged in to run the test.</p>
            
            <button onClick={runTest} disabled={!user || connectionStatus === 'testing'} style={{ padding: '10px 20px', fontSize: '16px', margin: '10px 0' }}>
                {user ? (connectionStatus === 'testing' ? 'Testing...' : 'Run Test') : 'Please log in first'}
            </button>
            
            <h2>Test Status: <span style={{ color: connectionStatus === 'success' ? 'green' : (connectionStatus === 'failed' ? 'red' : 'black') }}>{connectionStatus}</span></h2>
            
            <h3>Logs:</h3>
            <pre style={{ border: '1px solid #ccc', background: '#f5f5f5', padding: '10px', height: '500px', overflowY: 'scroll', whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
                {logs.join('\n')}
            </pre>
        </div>
    );
};

export default WebSocketTestPage;
