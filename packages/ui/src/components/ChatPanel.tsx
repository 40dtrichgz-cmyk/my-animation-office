import React, { useState, useEffect, useRef } from 'react';
import { eventBus } from '../events';
import { getColyseusRoom } from '../game/Game';
import { FloatingPanel } from './FloatingPanel';

const AGENTS = [
    { id: 'director', name: '👑 CEO' },
    { id: 'modeler', name: '📋 ผู้จัดการ' },
    { id: 'rigger', name: '💰 CFO' },
    { id: 'animator', name: '🎨 ฟรีแลนซ์' },
    { id: 'texturer', name: '🧑‍💼 พนักงาน' },
];

export function ChatPanel() {
    const [messages, setMessages] = useState<{ sender: string, text: string }[]>([
        { sender: 'ระบบ', text: 'เริ่มต้นออฟฟิศเรียบร้อย' }
    ]);
    const [input, setInput] = useState('');
    const [target, setTarget] = useState('director');
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleChat = (e: any) => {
            setMessages(prev => [...prev, e.detail]);
        };
        eventBus.addEventListener('chat-message', handleChat);
        return () => eventBus.removeEventListener('chat-message', handleChat);
    }, []);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const send = () => {
        if (!input.trim()) return;
        const room = getColyseusRoom();
        if (room) {
            room.send('chat', { text: input, target });
            setInput('');
        } else {
            setMessages(prev => [...prev, { sender: 'ระบบ', text: 'ผิดพลาด: ส่งข้อความไม่ได้ ยังไม่ได้เชื่อมต่อ Colyseus' }]);
        }
    };

    const isSystem = (s: string) => s === 'ระบบ' || s === 'System';

    return (
        <FloatingPanel id="chat" title="💬 แชตออฟฟิศ" width={320} defaultDock="right" defaultY={430} zIndex={17}>
            <div style={{ display: 'flex', flexDirection: 'column', height: 320 }}>
                <div style={{ flex: 1, overflowY: 'auto', fontSize: '13px', marginBottom: 10, paddingRight: 4 }}>
                    {messages.map((m, i) => (
                        <p key={i} style={{ margin: '6px 0', lineHeight: '1.4' }}>
                            <strong style={{ color: isSystem(m.sender) ? '#00eeff' : '#aaffaa' }}>{m.sender}:</strong> {m.text}
                        </p>
                    ))}
                    <div ref={endRef} />
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <select
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                        style={{
                            flex: 0, padding: '10px', boxSizing: 'border-box',
                            background: '#333', color: 'white', border: '1px solid #444', borderRadius: 4, outline: 'none',
                            fontSize: '12px'
                        }}
                    >
                        {AGENTS.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                    </select>
                    <input
                        type="text"
                        placeholder="พิมพ์ข้อความ..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && send()}
                        style={{ flex: 1, padding: '10px', boxSizing: 'border-box', background: '#333', color: 'white', border: '1px solid #444', borderRadius: 4, outline: 'none' }}
                    />
                    <button
                        onClick={send}
                        style={{
                            padding: '10px 14px', boxSizing: 'border-box', background: '#6c5ce7', color: 'white',
                            border: '1px solid #444', borderRadius: 4, cursor: 'pointer', fontSize: '12px', fontWeight: 'bold'
                        }}
                    >
                        ส่ง
                    </button>
                </div>
            </div>
        </FloatingPanel>
    );
}
