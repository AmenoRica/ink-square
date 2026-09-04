'use client';
/* oxlint-disable jsx-a11y/media-has-caption -- live WebRTC voice streams have no caption track */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Hash, Headphones, Mic, MicOff, Radio, Send, Settings, Users, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { InklingVoiceEngine, type VoiceSettings } from '@/lib/audio/inkling-engine';
import { createProfile, scrambleMessage, type Profile, type VoicePreset } from '@/lib/chat';

type Member = Profile & { id: string; voiceChannel: number | null };
type ChatMessage = Pick<Member, 'id' | 'nickname' | 'color'> & { messageId: string; content: string; createdAt: number };
type SignalKind = 'chat' | 'voice';
type SignalData = RTCSessionDescriptionInit | RTCIceCandidateInit;
type ServerMessage =
  | { type: 'hello'; members: Member[]; chatPeerIds: string[] }
  | { type: 'presence'; member: Member; action: 'upsert' | 'leave' }
  | { type: 'voice-peers'; peerIds: string[] }
  | { type: 'signal'; kind: SignalKind; from: string; data: SignalData };

const baseSettings: VoiceSettings = { voiceStyle: 'balanced', excited: false, characterPitch: 15, obscurity: 88, chop: 92, jitter: 0, crush: 0, bubbles: 48, invention: 78, wet: 100, volume: 72, monitorOriginal: false, voiceIsolation: true };
const channels = [1, 2, 3, 4];
const iceServers: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] }];

function presetLabels(preset: VoicePreset) {
  return {
    pitch: preset.characterPitch === 12 ? '낮음' : preset.characterPitch === 18 ? '높음' : '보통',
    style: preset.voiceStyle === 'sharp' ? '날카로움' : preset.voiceStyle === 'soft' ? '부드러움' : '기본',
    excited: preset.excited ? '신남' : '차분함',
  };
}

function Avatar({ color, name, size = 'normal' }: { color: string; name: string; size?: 'small' | 'normal' | 'large' }) {
  return <span className={`avatar avatar-${size}`} style={{ backgroundColor: color }} aria-label={`${name}의 프로필 색상`} />;
}

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clientId, setClientId] = useState('');
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [connection, setConnection] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [voiceChannel, setVoiceChannel] = useState<number | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'starting' | 'live' | 'error'>('idle');
  const [muted, setMuted] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const socket = useRef<WebSocket | null>(null);
  const selfId = useRef('');
  const profileRef = useRef<Profile | null>(null);
  const voiceChannelRef = useRef<number | null>(null);
  const engine = useRef<InklingVoiceEngine | null>(null);
  const outputStream = useRef<MediaStream | null>(null);
  const chatPeers = useRef(new Map<string, { pc: RTCPeerConnection; channel?: RTCDataChannel }>());
  const voicePeers = useRef(new Map<string, RTCPeerConnection>());
  const messagesEnd = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const next = createProfile();
      const id = crypto.randomUUID();
      selfId.current = id;
      profileRef.current = next;
      setProfile(next);
      setClientId(id);
      setNicknameDraft(next.nickname);
    });
  }, []);
  useEffect(() => { profileRef.current = profile; }, [profile]);
  useEffect(() => { voiceChannelRef.current = voiceChannel; }, [voiceChannel]);
  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendServer = (payload: object) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(payload));
  };
  const sendSignal = (kind: SignalKind, target: string, data: SignalData) => sendServer({ type: 'signal', kind, target, data });
  const removePeer = (kind: SignalKind, peerId: string) => {
    if (kind === 'chat') {
      chatPeers.current.get(peerId)?.pc.close();
      chatPeers.current.delete(peerId);
    } else {
      voicePeers.current.get(peerId)?.close();
      voicePeers.current.delete(peerId);
      setRemoteStreams((current) => { const next = new Map(current); next.delete(peerId); return next; });
    }
  };

  const bindDataChannel = (peerId: string, channel: RTCDataChannel) => {
    const entry = chatPeers.current.get(peerId);
    if (entry) entry.channel = channel;
    channel.onmessage = (event) => {
      const payload = JSON.parse(String(event.data)) as { type: 'chat'; message: ChatMessage } | { type: 'profile'; profile: Profile };
      if (payload.type === 'chat') setMessages((current) => [...current, payload.message].slice(-100));
      else setMembers((current) => current.map((member) => member.id === peerId ? { ...member, ...payload.profile } : member));
    };
  };

  const makePeer = (kind: SignalKind, peerId: string, initiator = false) => {
    if (kind === 'chat') {
      const existing = chatPeers.current.get(peerId);
      if (existing) return existing.pc;
      const pc = new RTCPeerConnection({ iceServers });
      chatPeers.current.set(peerId, { pc });
      if (initiator) bindDataChannel(peerId, pc.createDataChannel('ink-chat'));
      pc.ondatachannel = (event) => bindDataChannel(peerId, event.channel);
      pc.onicecandidate = (event) => { if (event.candidate) sendSignal('chat', peerId, event.candidate.toJSON()); };
      pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) removePeer('chat', peerId); };
      return pc;
    }
    const existing = voicePeers.current.get(peerId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers });
    outputStream.current?.getAudioTracks().forEach((track) => pc.addTrack(track, outputStream.current!));
    pc.onicecandidate = (event) => { if (event.candidate) sendSignal('voice', peerId, event.candidate.toJSON()); };
    pc.ontrack = (event) => setRemoteStreams((current) => new Map(current).set(peerId, event.streams[0] ?? new MediaStream([event.track])));
    pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) removePeer('voice', peerId); };
    voicePeers.current.set(peerId, pc);
    return pc;
  };

  const startOffer = async (kind: SignalKind, peerId: string) => {
    const pc = makePeer(kind, peerId, true);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal(kind, peerId, offer);
  };

  const handleSignal = async (kind: SignalKind, from: string, data: SignalData) => {
    const pc = makePeer(kind, from);
    if ('type' in data && data.type === 'offer') {
      await pc.setRemoteDescription(data);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(kind, from, answer);
    } else if ('type' in data && data.type === 'answer') await pc.setRemoteDescription(data);
    else if ('candidate' in data) await pc.addIceCandidate(data).catch(() => undefined);
  };

  useEffect(() => {
    if (!clientId) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const connect = () => {
      const current = profileRef.current;
      if (!current || disposed) return;
      setConnection('connecting');
      const params = new URLSearchParams({ id: selfId.current, nickname: current.nickname, color: current.color, pitch: String(current.preset.characterPitch), style: current.preset.voiceStyle, excited: String(current.preset.excited) });
      const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/realtime?${params}`);
      socket.current = ws;
      ws.onopen = () => setConnection('online');
      ws.onmessage = (event) => {
        const payload = JSON.parse(String(event.data)) as ServerMessage;
        if (payload.type === 'hello') {
          setMembers(payload.members);
          payload.chatPeerIds.forEach((id) => void startOffer('chat', id));
        } else if (payload.type === 'presence') {
          setMembers((currentMembers) => payload.action === 'leave' ? currentMembers.filter((member) => member.id !== payload.member.id) : [...currentMembers.filter((member) => member.id !== payload.member.id), payload.member]);
          if (payload.action === 'leave') { removePeer('chat', payload.member.id); removePeer('voice', payload.member.id); }
          else if (payload.member.voiceChannel !== voiceChannelRef.current) removePeer('voice', payload.member.id);
        } else if (payload.type === 'voice-peers') payload.peerIds.forEach((id) => void startOffer('voice', id));
        else if (payload.type === 'signal') void handleSignal(payload.kind, payload.from, payload.data);
      };
      ws.onclose = () => {
        setConnection('offline');
        chatPeers.current.forEach(({ pc }) => pc.close());
        chatPeers.current.clear();
        if (!disposed) retry = setTimeout(connect, 1500);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { disposed = true; clearTimeout(retry); socket.current?.close(); };
  }, [clientId]);

  useEffect(() => () => {
    chatPeers.current.forEach(({ pc }) => pc.close());
    voicePeers.current.forEach((pc) => pc.close());
    void engine.current?.stop();
  }, []);

  const leaveVoice = async () => {
    sendServer({ type: 'voice-channel', channel: null });
    voicePeers.current.forEach((pc) => pc.close());
    voicePeers.current.clear();
    setRemoteStreams(new Map());
    outputStream.current = null;
    await engine.current?.stop();
    engine.current = null;
    setVoiceChannel(null);
    setVoiceStatus('idle');
    setMuted(false);
  };

  const joinVoice = async (channel: number) => {
    if (!profile || connection !== 'online') return;
    if (voiceChannel === channel) return await leaveVoice();
    if (voiceChannel !== null) await leaveVoice();
    setVoiceStatus('starting');
    const next = new InklingVoiceEngine();
    next.update({ ...baseSettings, ...profile.preset });
    try {
      await next.start();
      engine.current = next;
      outputStream.current = next.getOutputStream() ?? null;
      setVoiceChannel(channel);
      setVoiceStatus('live');
      sendServer({ type: 'voice-channel', channel });
    } catch { await next.stop(); setVoiceStatus('error'); }
  };

  const submitChat = (event: { preventDefault(): void }) => {
    event.preventDefault();
    const content = scrambleMessage(chatDraft);
    if (!content || !profile) return;
    const message: ChatMessage = { id: selfId.current, nickname: profile.nickname, color: profile.color, messageId: crypto.randomUUID(), content, createdAt: Date.now() };
    setMessages((current) => [...current, message].slice(-100));
    chatPeers.current.forEach(({ channel }) => { if (channel?.readyState === 'open') channel.send(JSON.stringify({ type: 'chat', message })); });
    setChatDraft('');
  };

  const saveNickname = () => {
    const nickname = nicknameDraft.trim().slice(0, 24);
    if (!nickname || !profile) return;
    const next = { ...profile, nickname };
    setProfile(next);
    profileRef.current = next;
    sendServer({ type: 'profile', nickname });
    chatPeers.current.forEach(({ channel }) => { if (channel?.readyState === 'open') channel.send(JSON.stringify({ type: 'profile', profile: next })); });
  };

  const toggleMute = () => {
    const next = !muted;
    outputStream.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  if (!profile) return <main className="loading-screen">입장 준비 중…</main>;
  const labels = presetLabels(profile.preset);
  const self = members.find((member) => member.id === clientId) ?? { ...profile, id: clientId, voiceChannel };

  return (
    <main className="app-shell">
      <aside className="server-rail" aria-label="서버 목록"><button className="server-button active" aria-label="잉크 광장 서버">오징</button><span className="rail-divider" /><span className={`network-dot ${connection}`} title={connection === 'online' ? '온라인' : '연결 중'} /></aside>
      <aside className="channel-sidebar">
        <header className="server-header"><div><strong>잉크 광장</strong><span>서버 1</span></div><ChevronDown size={17} /></header>
        <nav className="channels" aria-label="채널">
          <p className="section-label">채팅 채널</p><button className="channel-button selected"><Hash size={18} />일반</button>
          <p className="section-label voice-label">음성 채널</p>
          {channels.map((channel) => {
            const channelMembers = members.filter((member) => member.voiceChannel === channel);
            return <div key={channel}>
              <button className={`channel-button ${voiceChannel === channel ? 'voice-active' : ''}`} onClick={() => void joinVoice(channel)} disabled={voiceStatus === 'starting'}><Volume2 size={17} />음성 {channel}{channelMembers.length > 0 && <span className="channel-count">{channelMembers.length}</span>}</button>
              {channelMembers.map((member) => <div className="voice-member" key={member.id}><Avatar color={member.color} name={member.nickname} size="small" /><span>{member.nickname}</span>{member.id === clientId && <Radio size={12} />}</div>)}
            </div>;
          })}
        </nav>
        <div className="voice-card">{voiceChannel ? <><div><Radio size={15} /><span><strong>음성 연결됨</strong><small>음성 {voiceChannel}</small></span></div><button onClick={() => void leaveVoice()}>연결 끊기</button></> : <div><Headphones size={15} /><span><strong>{voiceStatus === 'error' ? '마이크 오류' : '음성 대기 중'}</strong><small>채널을 눌러 입장</small></span></div>}</div>
        <div className="self-panel">
          <Avatar color={self.color} name={self.nickname} /><span className="self-name"><strong>{self.nickname}</strong><small>{connection === 'online' ? '온라인' : '연결 중…'}</small></span>
          <button className="icon-button" onClick={toggleMute} disabled={!voiceChannel} aria-label={muted ? '음소거 해제' : '음소거'}>{muted ? <MicOff size={17} /> : <Mic size={17} />}</button>
          <Dialog><DialogTrigger render={<button className="icon-button" aria-label="프로필 설정" />}><Settings size={17} /></DialogTrigger>
            <DialogContent className="profile-dialog"><DialogHeader><DialogTitle>프로필 설정</DialogTitle><DialogDescription>닉네임은 자유롭게 바꿀 수 있어요. 색상과 목소리는 이번 접속 동안 고정됩니다.</DialogDescription></DialogHeader>
              <div className="profile-preview"><Avatar color={profile.color} name={profile.nickname} size="large" /><div><strong>{profile.nickname}</strong><span>중복 닉네임 허용</span></div></div>
              <label className="field-label" htmlFor="nickname">닉네임<Input id="nickname" value={nicknameDraft} onChange={(event) => setNicknameDraft(event.target.value)} maxLength={24} /></label>
              <div className="locked-settings"><span><small>음높이</small><strong>{labels.pitch}</strong></span><span><small>음색</small><strong>{labels.style}</strong></span><span><small>기분</small><strong>{labels.excited}</strong></span></div>
              <p className="locked-note">목소리 프리셋은 입장할 때 무작위로 정해져 변경할 수 없습니다.</p><DialogFooter><Button onClick={saveNickname}>닉네임 저장</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </aside>
      <section className="chat-panel">
        <header className="chat-header"><div><Hash size={20} /><strong>일반</strong><span>말은 잉크 문자로 바뀌어 보여요</span></div><div className="member-summary"><Users size={18} />{members.length}</div></header>
        <div className="message-list"><div className="channel-intro"><span><Hash size={28} /></span><h1>일반 채널에 오신 걸 환영해요!</h1><p>문장은 무작위 알파벳으로 바뀌어 P2P로 전달되며, 모두 나가면 기록도 사라집니다.</p></div>
          {messages.map((message) => <article className="message" key={message.messageId}><Avatar color={message.color} name={message.nickname} /><div><p className="message-meta"><strong>{message.nickname}</strong><time>{new Date(message.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</time></p><p className="ink-message">{message.content}</p></div></article>)}<div ref={messagesEnd} />
        </div>
        <form className="chat-composer" onSubmit={submitChat}><input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="#일반에 메시지 보내기" maxLength={500} disabled={connection !== 'online'} aria-label="메시지" /><button type="submit" disabled={!chatDraft.trim() || connection !== 'online'} aria-label="전송"><Send size={18} /></button></form>
      </section>
      <aside className="member-sidebar"><p className="section-label">온라인 — {members.length}</p>{[...members].sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko')).map((member) => <div className="member-row" key={member.id}><Avatar color={member.color} name={member.nickname} /><span><strong>{member.nickname}</strong><small>{member.voiceChannel ? `음성 ${member.voiceChannel}` : '둘러보는 중'}</small></span></div>)}</aside>
      <div className="remote-audio" aria-hidden="true">{[...remoteStreams].map(([peerId, stream]) => <audio key={peerId} autoPlay playsInline ref={(element) => { if (element) element.srcObject = stream; }} />)}</div>
    </main>
  );
}
