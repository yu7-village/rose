import { SkyWayContext } from '@skyway-sdk/core';
import { SkyWayRoom } from '@skyway-sdk/room';

let room, me, localStream;

async function getToken() {
  const res = await fetch('/token');
    
  return res.json();
}

document.getElementById('join').onclick = async () => {
  const { token, memberId } = await getToken();
  const context = await SkyWayContext.Create(token);
  room = await SkyWayRoom.FindOrCreate(context, { type: 'p2p', name: 'test-room' });
  me = await room.join({ id: memberId });

  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById('local').srcObject = localStream;

  await me.publish(localStream);

  room.onStreamSubscribed.add(e => {
    document.getElementById('remote').srcObject = e.stream;
  });
};

document.getElementById('leave').onclick = () => {
  if (room) room.leave();
};

document.getElementById('mute').onclick = () => {
  if (localStream) {
    localStream.getAudioTracks().forEach(track => track.enabled = !track.enabled);
  }
};
