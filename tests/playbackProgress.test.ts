import test from "node:test";
import assert from "node:assert/strict";
import { bindPlaybackProgress } from "../src/lib/playbackProgress.ts";

test("playback progress resumes, saves and clears completed videos", () => {
  const values = new Map<string,string>();
  Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
  Object.defineProperty(globalThis,"window",{configurable:true,value:new EventTarget()});
  class Media extends EventTarget { duration=100; currentTime=0; ended=false; }
  values.set("91-playback-progress-v1",JSON.stringify({example:{seconds:35,updatedAt:Date.now()}}));
  const media = new Media();
  const cleanup = bindPlaybackProgress(media as unknown as HTMLVideoElement,"example");
  assert.equal(media.currentTime,35);
  media.currentTime=55;media.dispatchEvent(new Event("pause"));
  assert.equal(JSON.parse(values.get("91-playback-progress-v1")!).example.seconds,55);
  media.currentTime=100;media.ended=true;media.dispatchEvent(new Event("ended"));
  assert.equal(JSON.parse(values.get("91-playback-progress-v1")!).example,undefined);
  cleanup();
});

test("malformed browser storage does not interrupt playback",()=>{
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:()=>"broken",setItem:()=>{throw Error("quota")}}});
 Object.defineProperty(globalThis,"window",{configurable:true,value:new EventTarget()});
 const media=Object.assign(new EventTarget(),{duration:100,currentTime:20,ended:false});
 const cleanup=bindPlaybackProgress(media as unknown as HTMLVideoElement,"example");
 assert.doesNotThrow(()=>media.dispatchEvent(new Event("pause")));
 cleanup();
});
