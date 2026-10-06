import { useEffect, useRef, type MutableRefObject } from "react";
import type { TrackerEngine } from "../lib/tracker";
import type { Preset, Pt, Settings } from "../lib/types";
import type { RegionId, RegionStates } from "../lib/regions";
import { type RegionStates } from "../lib/regions";
import { useMultiRegionTracker } from "../hooks/useMultiRegionTracker";
import { warpImage } from "../lib/warp";

interface Props {
  engine: TrackerEngine;
  settingsRef: MutableRefObject<Settings>;
  imagesRef: MutableRefObject<Map<string, HTMLImageElement>>;
  onHandCount: (n: number) => void;
  onRegions: (states: RegionStates) => void;
}

const IDS: RegionId[] = ["eyes","mouth","forehead","fullFace"];

interface Particle { x:number;y:number;vx:number;vy:number;life:number;max:number;size:number; }

export default function FaceCanvasOverlay({ engine, settingsRef, imagesRef, onHandCount, onRegions }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const getRegions = useMultiRegionTracker(engine);

  useEffect(() => {
    const canvas=canvasRef.current!;
    const ctx=canvas.getContext("2d",{alpha:false})!;
    const video=engine.video!;
    let raf=0,last=performance.now(),fpsT=last,frames=0,fps=0;
    let smooth:Partial<Record<RegionId,Pt[]>>={};
    let alpha:Record<RegionId,number>={eyes:0,mouth:0,forehead:0,fullFace:0};
    const particles:Particle[]=[];

    const lerpQuad=(prev:Pt[]|undefined,next:Pt[],k:number)=>{
      if(!prev)return next.map(p=>({...p}));
      return next.map((p,i)=>({x:prev[i].x+(p.x-prev[i].x)*k,y:prev[i].y+(p.y-prev[i].y)*k}));
    };

    const drawGlow=(q:Pt[],s:Settings,a:number)=>{
      ctx.save();ctx.globalAlpha=a;ctx.lineJoin="round";ctx.beginPath();
      q.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
      ctx.shadowColor=s.neon;ctx.shadowBlur=s.glow;ctx.strokeStyle=s.neon;ctx.lineWidth=s.width;ctx.stroke();
      ctx.shadowBlur=0;ctx.strokeStyle="rgba(255,255,255,.9)";ctx.lineWidth=Math.max(1,s.width*.3);ctx.stroke();ctx.restore();
    };

    const loop=(now:number)=>{
      raf=requestAnimationFrame(loop);
      const dt=Math.min(.05,(now-last)/1000);last=now;
      const s=settingsRef.current;
      const W=video.videoWidth||1280,H=video.videoHeight||720;
      if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}

      ctx.save();ctx.scale(-1,1);ctx.drawImage(video,-W,0,W,H);ctx.restore();
      ctx.fillStyle="rgba(13,13,17,.16)";ctx.fillRect(0,0,W,H);

      const hands=engine.latest;
      onHandCount(hands.length);
      const states=getRegions(W,H);
      onRegions(states);

      for(const id of IDS){
        const st=states[id];
        if(st.active&&st.quad.length===4) smooth[id]=lerpQuad(smooth[id],st.quad,Math.min(1,dt*12));
        const target=st.active?1:0;
        alpha[id]+=(target-alpha[id])*Math.min(1,dt*10);
        if(alpha[id]<.02)continue;
        const q=smooth[id]; if(!q)continue;
        const assetId=s.regionPresets[id]||s.presetId;
        const img=imagesRef.current.get(assetId);
        if(img){
          ctx.save();ctx.globalAlpha=alpha[id]*s.opacity;warpImage(ctx,img,q,6);ctx.restore();
        }
        drawGlow(q,s,alpha[id]);

        if(s.particles&&st.active&&particles.length<220){
          const edge=Math.floor(Math.random()*4),a=q[edge],b=q[(edge+1)%4],t=Math.random();
          particles.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,vx:(Math.random()-.5)*70,vy:-25-Math.random()*70,life:0,max:.4+Math.random()*.8,size:1.5+Math.random()*2.5});
        }
      }

      if(particles.length){
        ctx.save();ctx.globalCompositeOperation="lighter";
        for(let i=particles.length-1;i>=0;i--){
          const p=particles[i];p.life+=dt;
          if(p.life>=p.max){particles.splice(i,1);continue;}
          p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=45*dt;
          const k=1-p.life/p.max;ctx.globalAlpha=k;ctx.fillStyle=s.neon;
          ctx.beginPath();ctx.arc(p.x,p.y,p.size*k+.5,0,Math.PI*2);ctx.fill();
        }
        ctx.restore();
      }

      if(s.debug){
        ctx.save();
        const face=engine.face.map(p=>({x:(1-p.x)*W,y:p.y*H}));
        ctx.fillStyle="rgba(255,255,255,.45)";
        for(const p of face) { ctx.beginPath();ctx.arc(p.x,p.y,1.3,0,Math.PI*2);ctx.fill(); }
        IDS.forEach((id)=>{
          const q=smooth[id]; if(!q)return;
          ctx.strokeStyle=id==="eyes"?"#38bdf8":id==="mouth"?"#ef4444":id==="forehead"?"#f97316":"#a78bfa";
          ctx.lineWidth=2;ctx.beginPath();q.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
        });
        ctx.restore();
      }

      frames++;
      if(now-fpsT>=500){fps=Math.round(frames*1000/(now-fpsT));frames=0;fpsT=now;}
      if(s.showFps){
        ctx.save();ctx.font="600 22px Orbitron,monospace";ctx.fillStyle="rgba(13,13,17,.7)";ctx.fillRect(14,14,118,36);
        ctx.fillStyle=fps>=50?"#34d399":fps>=30?"#fbbf24":"#f87171";ctx.fillText(`${fps} FPS`,24,40);ctx.restore();
      }
    };
    raf=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(raf);
  },[engine,settingsRef,imagesRef,onHandCount,onRegions,getRegions]);

  return <canvas ref={canvasRef} className="block h-full w-full object-contain" />;
}
