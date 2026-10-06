import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SlidersHorizontal } from "lucide-react";
import Header from "./components/Header";
import LoadingScreen from "./components/LoadingScreen";
import FaceCanvasOverlay from "./components/FaceCanvasOverlay";
import ControlsDrawer from "./components/ControlsDrawer";
import PermissionFallback from "./components/PermissionFallback";
import PythosxBadge from "./components/PythosxBadge";
import { TrackerEngine, type CameraError } from "./lib/tracker";
import { BUILTIN_PRESETS, loadImage } from "./lib/presets";
import { DEFAULT_SETTINGS, type Preset, type Settings } from "./lib/types";
import type { RegionStates } from "./lib/regions";

const STAGES=[
  "Preparing interface","Decoding anime portals","Loading vision runtime",
  "Warming up hand + face models","Starting webcam","Syncing multi-region tracking"
];

const nextPaint=(ms=180)=>new Promise<void>(r=>requestAnimationFrame(()=>setTimeout(r,ms)));

export default function App(){
  const [stage,setStage]=useState(0),[ready,setReady]=useState(false);
  const [error,setError]=useState<CameraError|"model"|null>(null);
  const [presets,setPresets]=useState<Preset[]>([]);
  const [settings,setSettings]=useState<Settings>(DEFAULT_SETTINGS);
  const [drawer,setDrawer]=useState(false),[handCount,setHandCount]=useState(0);
  const [regions,setRegions]=useState<RegionStates>({
    eyes:{active:false,score:0,quad:[]},mouth:{active:false,score:0,quad:[]},
    forehead:{active:false,score:0,quad:[]},fullFace:{active:false,score:0,quad:[]}
  });

  const engine=useMemo(()=>new TrackerEngine(),[]);
  const videoRef=useRef<HTMLVideoElement>(null);
  const settingsRef=useRef(settings);settingsRef.current=settings;
  const imagesRef=useRef(new Map<string,HTMLImageElement>());
  const booting=useRef(false),runtimeLoaded=useRef(false),modelLoaded=useRef(false);

  const set=useCallback(<K extends keyof Settings>(k:K,v:Settings[K])=>setSettings(s=>({...s,[k]:v})),[]);

  const boot=useCallback(async()=>{
    if(booting.current)return;booting.current=true;setError(null);
    try{
      setStage(0);await nextPaint(300);
      setStage(1);
      if(!imagesRef.current.size){
        for(const p of BUILTIN_PRESETS){imagesRef.current.set(p.id,await loadImage(p.src));await nextPaint(60);}
        setPresets(BUILTIN_PRESETS);
      }
      setStage(2);await nextPaint();
      if(!runtimeLoaded.current){try{await engine.loadRuntime();runtimeLoaded.current=true}catch{setError("model");return;}}
      setStage(3);await nextPaint();
      if(!modelLoaded.current){try{await engine.initModel();modelLoaded.current=true}catch{setError("model");return;}}
      setStage(4);await nextPaint();
      try{await engine.startCamera(videoRef.current!)}catch(e){setError((typeof e==="string"?e:"unknown") as CameraError);return;}
      setStage(5);await nextPaint();engine.startDetection();await nextPaint(350);
      setStage(STAGES.length);setReady(true);
    }finally{booting.current=false;}
  },[engine]);

  useEffect(()=>{boot();return()=>engine.stop()},[boot,engine]);

  const upload=(file:File)=>{
    const url=URL.createObjectURL(file);
    loadImage(url).then(img=>{
      const id="custom-"+Date.now();imagesRef.current.set(id,img);
      setPresets(p=>[...p,{id,name:file.name.replace(/\.[^.]+$/,"").slice(0,14)||"Custom",src:url,accent:"#06B6D4"}]);
      set("presetId",id);
    });
  };

  return <div className="relative flex h-full flex-col items-center justify-center bg-ink bg-grid px-3">
    <Header active={ready} handCount={handCount}/>
    <video ref={videoRef} className="pointer-events-none absolute h-px w-px opacity-0" playsInline muted/>
    <main className="relative mt-14 flex w-full max-w-5xl flex-1 items-center justify-center pb-24 pt-4">
      {error?<PermissionFallback kind={error} onRetry={boot}/>:<motion.div
        initial={{opacity:0,scale:.97}} animate={{opacity:ready?1:0,scale:ready?1:.97}} transition={{duration:.6}}
        className="relative aspect-video max-h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-black"
        style={{boxShadow:`0 0 60px ${settings.neon}33,0 0 0 1px ${settings.neon}22`}}>
        {ready&&<FaceCanvasOverlay engine={engine} settingsRef={settingsRef} imagesRef={imagesRef}
          onHandCount={setHandCount} onRegions={setRegions}/>}
        {ready&&<div className="absolute left-1/2 top-3 flex -translate-x-1/2 gap-1 rounded-full glass px-3 py-1.5 text-xs font-semibold text-white/80">
          {(["eyes","mouth","forehead","fullFace"] as const).map(id=>
            <span key={id} className={`rounded-full px-2 py-1 transition ${regions[id].active?"bg-white/15 text-white":"text-white/35"}`}>
              {id==="fullFace"?"Full Face":id[0].toUpperCase()+id.slice(1)}{regions[id].active?" ✓":""}
            </span>)}
        </div>}
        {ready&&handCount===0&&<motion.p initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
          className="glass absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-1.5 text-base text-white/85">
          Cover your eyes, mouth, or forehead with your hand
        </motion.p>}
      </motion.div>}
    </main>
    <motion.button initial={{scale:0,rotate:-90}} animate={{scale:ready?1:0,rotate:0}}
      transition={{type:"spring",stiffness:260,damping:18,delay:.2}} whileHover={{scale:1.1}} whileTap={{scale:.92}}
      onClick={()=>setDrawer(true)} aria-label="Open controls"
      className="fixed bottom-6 right-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-violet-neon text-white shadow-[0_0_28px_#8B5CF6aa]">
      <SlidersHorizontal size={20}/>
    </motion.button>
    <ControlsDrawer open={drawer} onClose={()=>setDrawer(false)} presets={presets} settings={settings} set={set} onUpload={upload}/>
    <div className="fixed bottom-5 left-1/2 z-20 -translate-x-1/2"><PythosxBadge audio={settings.audio}/></div>
    <AnimatePresence>{!ready&&!error&&<LoadingScreen stages={STAGES} current={stage}/>}</AnimatePresence>
  </div>;
}
