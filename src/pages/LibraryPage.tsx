import {useEffect,useMemo,useState} from "react";
import {AppShell} from "@/components/AppShell";
import {VideoGrid} from "@/components/VideoGrid";
import {fetchVideoDetail} from "@/data/videos";
import {favoriteIDs} from "@/lib/localFavorites";
import {recentPlaybackIDs} from "@/lib/playbackProgress";
import type {VideoItem} from "@/types";
import "./library.css";
import { Link } from "react-router";
import { FolderHeart, History } from "lucide-react";

export default function LibraryPage(){
 const [mode,setMode]=useState<"favorites"|"recent">("favorites");
 const [page,setPage]=useState(0);
 const [revision,setRevision]=useState(0);
 const [videos,setVideos]=useState<VideoItem[]>([]);
 const [loading,setLoading]=useState(false);
 const [missing,setMissing]=useState(0);
 const ids=useMemo(()=>mode==="favorites"?favoriteIDs():recentPlaybackIDs(),[mode,revision]);
 useEffect(()=>{document.title="我的影片庫"; const update=()=>setRevision(v=>v+1);window.addEventListener("91-favorites-changed",update);return()=>window.removeEventListener("91-favorites-changed",update)},[]);
 useEffect(()=>{
  let active=true;setLoading(true);setVideos([]);setMissing(0);
  Promise.allSettled(ids.slice(page*24,(page+1)*24).map(fetchVideoDetail)).then(results=>{
   if(!active)return;
   const loaded=results.flatMap(result=>result.status==="fulfilled"&&result.value?[result.value]:[]);
   setVideos(loaded);setMissing(results.length-loaded.length);setLoading(false);
  });return()=>{active=false};
 },[ids,page]);
 return <AppShell><section className="library-page" style={{maxWidth:1200,margin:"auto",padding:20}}>
  <h1>我的影片庫</h1>
  <p>喜歡的影片，與還沒看完的故事，都在這裡。</p>
  <div className="library-segments" role="group" aria-label="影片庫分類">
   <button onClick={()=>{setMode("favorites");setPage(0)}} aria-pressed={mode==="favorites"}>我的收藏</button>
   <button onClick={()=>{setMode("recent");setPage(0)}} aria-pressed={mode==="recent"}>繼續觀看</button>
  </div>
  {loading?<p role="status">載入中…</p>:<>{videos.length>0&&<VideoGrid videos={videos}/>} {ids.length===0&&<div className="library-page__empty" role="status">
    <span className="library-empty-icon">{mode==="favorites"?<FolderHeart size={28}/>:<History size={28}/>}</span>
    <h2>{mode==="favorites"?"留住喜歡的每一部":"從上次的片刻繼續"}</h2>
    <p>{mode==="favorites"?"瀏覽影片時點選收藏，就能在這裡輕鬆找到。":"播放影片後，這裡會記住你的觀看進度。"}</p>
    <Link to="/list" className="library-empty-browse">瀏覽影片</Link>
  </div>}{missing>0&&<p role="status">本頁有 {missing} 個項目暫時無法載入，可稍後重試。</p>}</>}
  {ids.length>24&&<div style={{display:"flex",gap:12,marginTop:20}}>
   <button disabled={page===0} onClick={()=>setPage(p=>p-1)}>上一頁</button>
   <span>{page+1} / {Math.max(1,Math.ceil(ids.length/24))}</span>
   <button disabled={(page+1)*24>=ids.length} onClick={()=>setPage(p=>p+1)}>下一頁</button>
  </div>}
  <p className="library-local-note">收藏與觀看進度僅儲存在此瀏覽器。</p>
 </section></AppShell>
}
