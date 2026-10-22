import test from "node:test";
import assert from "node:assert/strict";
import {traditionalUI,localizeResponseMessages} from "../src/lib/traditionalUI.ts";

test("localizes interface messages without changing metadata or protocol fields",()=>{
 const input={message:"视频加载失败，请稍后重试",title:"原始视频标题.mp4",fileName:"视频.mp4",status:"pending",theme:"pink",nested:{error:"网盘密码错误"}};
 const output=localizeResponseMessages(input);
 assert.equal(output.message,"影片載入失敗，請稍後重試");
 assert.equal(output.nested.error,"雲端硬碟密碼錯誤");
 assert.equal(output.title,input.title);assert.equal(output.fileName,input.fileName);
 assert.equal(output.status,"pending");assert.equal(output.theme,"pink");
 assert.equal(input.message,"视频加载失败，请稍后重试");
 assert.equal(traditionalUI("文件夹上传完成"),"資料夾上傳完成");
});
