import test from "node:test";
import assert from "node:assert/strict";
import {favoriteIDs,toggleFavorite} from "../src/lib/localFavorites.ts";

test("favorites persist and toggle without duplicates",()=>{
 const values=new Map<string,string>();
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value)}});
 Object.defineProperty(globalThis,"window",{configurable:true,value:new EventTarget()});
 assert.deepEqual(favoriteIDs(),[]);
 assert.equal(toggleFavorite("clip"),true);
 assert.deepEqual(favoriteIDs(),["clip"]);
 assert.equal(toggleFavorite("clip"),false);
 assert.deepEqual(favoriteIDs(),[]);
 values.set("91-local-favorites-v1","invalid-json");
 assert.deepEqual(favoriteIDs(),[]);
});
