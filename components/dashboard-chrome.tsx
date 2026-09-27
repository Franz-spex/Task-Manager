'use client';
import { useEffect, useState } from 'react';
import { LayoutDashboard, CheckSquare, FolderKanban, CalendarDays, Sparkles, Settings, ChevronDown, ArrowLeft, SlidersHorizontal, PanelLeft, Sun, Search, HardDrive } from 'lucide-react';
import { Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarTrigger, useSidebar } from './ui/sidebar';

export function Navigation({page,go,projects,settingsTab}:{page:string;go:(s:string,p?:string)=>void;projects:string[];settingsTab:string}) {
 const {setOpenMobile,toggleSidebar}=useSidebar();
 const navigate=(s:string,p?:string)=>{go(s,p);setOpenMobile(false)};
 const items=[['Dashboard',LayoutDashboard],['My Tasks',CheckSquare],['Projects & Boards',FolderKanban],['Calendar',CalendarDays],['AI Assistant',Sparkles],['Settings',Settings]] as const;
 return <Sidebar className="taskline-sidebar">
  <SidebarHeader><div className="logo-row"><a href="#dashboard" className="brand" onClick={e=>{e.preventDefault();navigate('Dashboard')}}><img className="taskbloc-logo" src="/taskbloc-logo.svg" alt="taskbloc" width="180" height="39"/></a><button className="sidebar-collapse" aria-label="Collapse navigation" onClick={toggleSidebar}><ArrowLeft size={17}/></button></div></SidebarHeader>
  <SidebarContent><div className="nav-caption">OVERVIEW</div><SidebarMenu>{items.slice(0,2).map(([name,Icon])=><SidebarMenuItem key={name}><SidebarMenuButton className="nav-item" isActive={page===name} onClick={()=>navigate(name)}><Icon/><span>{name}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu>
  <div className="nav-divider"/><div className="nav-caption">MANAGEMENT</div><SidebarMenu>{items.slice(2).map(([name,Icon])=><SidebarMenuItem key={name}><SidebarMenuButton className="nav-item" isActive={page===name} onClick={()=>navigate(name)}><Icon/><span>{name}</span>{(name==='Settings'||name==='Projects & Boards')&&<ChevronDown className="nav-chevron"/>}</SidebarMenuButton>{name==='Projects & Boards'&&<div className="nested-nav">{projects.slice(0,4).map(p=><button key={p} onClick={()=>navigate(name,p)}><span/>{p}</button>)}</div>}{name==='Settings'&&<div className="nested-nav"><button className={page==='Settings'&&settingsTab==='preferences'?'nested-active':''} onClick={()=>navigate('Settings')}><span/>Preferences</button><button className={page==='Settings'&&settingsTab==='integrations'?'nested-active':''} onClick={()=>navigate('Integrations')}><span/>Integrations</button></div>}</SidebarMenuItem>)}</SidebarMenu></SidebarContent>
  <SidebarFooter><button className="workspace-settings-card" onClick={()=>navigate('Settings')}><div className="workspace-card-title"><span className="workspace-settings-icon"><SlidersHorizontal size={20}/></span><div><small>TASKBLOC HUB</small><strong>Workspace Settings</strong></div><ChevronDown size={16}/></div><p>Personal workspace</p><div className="workspace-meter"><span/></div><div className="workspace-card-footer"><HardDrive size={15}/> Data & preferences</div></button></SidebarFooter>
 </Sidebar>
}

export function Topbar({page,name,query,setQuery,blocked,openSettings,syncLabel='Saved locally'}:{page:string;name:string;query:string;setQuery:(s:string)=>void;blocked:boolean;syncLabel?:string;openSettings:()=>void}) {return <header className="topbar"><div className="top-breadcrumb"><SidebarTrigger/><PanelLeft size={16}/><span>Main Workspace</span><span className="breadcrumb-slash">/</span><strong>{page}</strong><span className="live-badge" title="This dashboard updates as you edit tasks">Live View</span></div><div className="top-right"><label className="top-search"><Search size={16}/><input aria-label="Search tasks" placeholder="Search tasks" value={query} onChange={e=>setQuery(e.target.value)}/></label><button className="member-stack" onClick={openSettings} aria-label={`${name}, personal workspace settings`}><span className="member-avatar">{name.slice(0,2).toUpperCase()}</span><span className="member-label">Personal</span></button><span className="saved-state"><span/>{blocked?'Storage unavailable':syncLabel}</span></div></header>}

export function WelcomeBanner({name}:{name:string}) {
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{const id=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(id)},[]);
 const hour=now.getHours(); const greeting=hour<12?'morning':hour<18?'afternoon':'evening';
 const time=now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true}).split(' ');
 return <section className="welcome-banner"><div><h1>Good {greeting}, {name}!</h1><p>Welcome back to your dashboard. A clear view of what needs your attention.</p><div className="welcome-clock"><time dateTime={now.toISOString()}>{time[0]}</time><span>{time[1]}</span></div></div><div className="weather-card" aria-label="Weather is not connected"><span className="weather-icon"><Sun size={32}/></span><div><strong>--°C</strong><span>Weather not connected</span><small>{now.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}</small></div></div></section>
}
