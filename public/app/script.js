/* ==========================================================================
   Trade Fill Rate 2026 — dashboard logic
   Row schema: [month,trade,region,city,category,status,sku, poQty,poVal,grnQty,grnVal]
   Values (poVal/grnVal) are in ₹ Lakh.
   ========================================================================== */
(function(){
"use strict";

var C = {month:0,trade:1,region:2,city:3,category:4,status:5,sku:6,
         poQty:7,poVal:8,grnQty:9,grnVal:10,date:11,po:12};

// Gap analysis metric: 'value' (₹ Lakh) or 'qty' (units)
var metricMode='value';

// slicer definitions (order shown left→right)
var SLICERS = [
  {key:"month",    label:"Month",    col:C.month},
  {key:"trade",    label:"Trade",    col:C.trade},
  {key:"region",   label:"Region",   col:C.region},
  {key:"city",     label:"City",     col:C.city},
  {key:"category", label:"Category", col:C.category},
  {key:"sku",      label:"SKU",      col:C.sku},
  {key:"status",   label:"Status",   col:C.status},
];

var DATA=null;              // {meta,dims,rows}
var SEL={};                 // key -> Set of selected indices (empty = all)
var DATE={from:null,to:null};// YYYYMMDD ints; null = open end (no filter)
var drillDim="sku";
var sortState={col:"gap",dir:-1};
var charts={};

/* ---------- helpers ---------- */
var nf=new Intl.NumberFormat('en-IN');
function fmt(n){return nf.format(Math.round(n||0));}
function pct(part,whole){return whole>0?Math.round(part/whole*100):0;}
function frClass(v){return v>=90?'fr-hi':v>=75?'fr-mid':'fr-lo';}
/* single-hue blue scale: same blue throughout, contrast (lightness) scales with the
   bar's own value — low fill rate = pale blue, high fill rate = deep navy. */
function clamp01(t){return t<0?0:t>1?1:t;}
function blueShade(v){
  var t=clamp01((v||0)/100);
  var light=[196,222,247];   // #C4DEF7 pale blue (low values)
  var dark =[13,42,92];      // #0D2A5C deep navy (high values)
  var rgb=light.map(function(c,i){return Math.round(c+(dark[i]-c)*t);});
  return 'rgb('+rgb.join(',')+')';
}
function barColor(v){return blueShade(v);}
function labelInk(v){return (v||0)>=55?'#FFFFFF':'#0D2A5C';}
function crLine(lakh){return '≈ ₹'+(lakh/100).toFixed(2)+' Cr';}
function fmtYMD(n){var s=String(n);return s.length===8?s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8):'';}

/* ---------- filtering ---------- */
function activeRows(exceptKey){
  var out=[], rows=DATA.rows;
  for(var i=0;i<rows.length;i++){
    var r=rows[i], keep=true;
    if(DATE.from && r[C.date]<DATE.from) continue;
    if(DATE.to && r[C.date]>DATE.to) continue;
    for(var s=0;s<SLICERS.length;s++){
      var sl=SLICERS[s]; if(sl.key===exceptKey) continue;
      var set=SEL[sl.key];
      if(set && set.size && !set.has(r[sl.col])){keep=false;break;}
    }
    if(keep) out.push(r);
  }
  return out;
}

/* ---------- click-to-filter (cross-filtering from charts) ---------- */
/* Clicking a bar / donut slice toggles that value in the matching slicer,
   then re-renders EVERYTHING — KPIs, hero, trend, tables, other charts. */
function toggleSelection(key,dimIdx){
  if(!SEL[key]) SEL[key]=new Set();
  var set=SEL[key];
  if(set.has(dimIdx)) set["delete"](dimIdx);   // click again = deselect
  else set.add(dimIdx);
  if(set.size===DATA.dims[key].length) set.clear();   // all selected = no filter
  render();
}

/* ---------- aggregation over a row set ---------- */
function agg(rows){
  var poV=0,grnV=0,poQ=0,grnQ=0,lines=rows.length,fully=0;
  var fullyIdx=DATA.dims.status.indexOf("Fully Supplied");
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    poV+=r[C.poVal]; grnV+=r[C.grnVal]; poQ+=r[C.poQty]; grnQ+=r[C.grnQty];
    if(r[C.status]===fullyIdx) fully++;
  }
  return {poV:poV,grnV:grnV,poQ:poQ,grnQ:grnQ,gapV:poV-grnV,lines:lines,fully:fully,
          frV:pct(grnV,poV),frQ:pct(grnQ,poQ)};
}
function groupBy(rows,col){
  var m={};
  for(var i=0;i<rows.length;i++){
    var r=rows[i], k=r[col];
    var g=m[k]||(m[k]={poV:0,grnV:0,lines:0});
    g.poV+=r[C.poVal]; g.grnV+=r[C.grnVal]; g.lines++;
  }
  return m;
}

/* ========================================================================
   RENDER
   ======================================================================== */
function render(){
  var rows=activeRows(null);
  var a=agg(rows);

  // hero
  document.getElementById('heroFR').innerHTML=a.frV+'<small>%</small>';
  document.getElementById('heroFRqty').innerHTML=a.frQ+'<small>%</small>';
  document.getElementById('splitFill').style.width=Math.min(a.frV,100)+'%';
  document.getElementById('splitSupplied').textContent='₹'+fmt(a.grnV)+' L';
  document.getElementById('splitGap').textContent='₹'+fmt(a.gapV)+' L';

  // kpis
  document.getElementById('kpiPO').innerHTML=fmt(a.poV)+'<span class="unit">₹L</span>';
  document.getElementById('kpiPOcr').textContent=crLine(a.poV);
  document.getElementById('kpiGRN').innerHTML=fmt(a.grnV)+'<span class="unit">₹L</span>';
  document.getElementById('kpiGAP').innerHTML=fmt(a.gapV)+'<span class="unit">₹L</span>';
  document.getElementById('kpiLines').textContent=fmt(a.lines);
  document.getElementById('kpiFully').textContent=pct(a.fully,a.lines)+'% fully supplied';

  drawDimBar('chTrade',C.trade,'trade');
  drawCityStatus();
  drawTable();
  updateSlicerButtons();
  renderActiveFilters();
}

/* ----- active filter summary: which slicers / date range are applied ----- */
function renderActiveFilters(){
  var host=document.getElementById('activeFilters');
  if(!host) return;
  var chips=[];
  SLICERS.forEach(function(sl){
    var set=SEL[sl.key];
    if(!set || !set.size || set.size===DATA.dims[sl.key].length) return;
    var names=Array.from(set).map(function(i){return DATA.dims[sl.key][i];});
    var text=names.length<=2?names.join(', '):names.length+' selected';
    chips.push({key:sl.key,label:sl.label,text:text});
  });
  if(DATE.from||DATE.to){
    var mn=DATA.meta.date_min, mx=DATA.meta.date_max;
    chips.push({key:'date',label:'Date',
      text:(DATE.from?ymdToStr(DATE.from):mn)+' → '+(DATE.to?ymdToStr(DATE.to):mx)});
  }
  if(!chips.length){ host.classList.remove('show'); host.innerHTML=''; return; }
  host.classList.add('show');
  host.innerHTML='<span class="af-label">Active filters</span>'+
    chips.map(function(c){
      return '<span class="af-chip">'+c.label+': <b>'+c.text+'</b>'+
        '<button class="af-x" data-k="'+c.key+'" title="Clear '+c.label+'">&times;</button></span>';
    }).join('')+
    '<button class="af-clear" id="afClearAll">Clear all</button>';
  host.querySelectorAll('.af-x').forEach(function(btn){
    btn.onclick=function(){
      var k=btn.getAttribute('data-k');
      if(k==='date') DATE={from:null,to:null}; else SEL[k].clear();
      render();
    };
  });
  var clearAll=document.getElementById('afClearAll');
  if(clearAll) clearAll.onclick=function(){
    SLICERS.forEach(function(sl){SEL[sl.key].clear();});
    DATE={from:null,to:null};
    render();
  };
}

/* ----- trend by month ----- */
function drawTrend(){
  var months=DATA.dims.month, frV=[], frQ=[];
  for(var mi=0;mi<months.length;mi++){
    // respect all slicers except we still want the month axis, so filter by month value
    var rows=activeRows('month').filter(function(r){return r[C.month]===mi;});
    var a=agg(rows); frV.push(a.frV); frQ.push(a.frQ);
  }
  upsertLine('chTrend',months,[
    {label:'Value FR %',data:frV,color:'#14406E',fill:true},
    {label:'Qty FR %',data:frQ,color:'#1FA97A',fill:false}
  ]);
}

/* ----- status donut (Expired excluded on purpose) ----- */
var HIDE_STATUS=['Expired'];
var STATUS_COLOR={'Fully Supplied':'#1FA97A','Partially Supplied':'#E0A100',
                  'Zero Supply':'#E4572E','Other':'#8494A8'};
function drawStatus(){
  var rows=activeRows('status');   // ignore the status filter so every slice stays clickable
  var all=DATA.dims.status, counts=all.map(function(){return 0;});
  for(var i=0;i<rows.length;i++) counts[rows[i][C.status]]++;
  var sel=SEL.status, anySel=sel && sel.size>0;
  var labels=[],data=[],colors=[],idxs=[];
  all.forEach(function(name,i){
    if(HIDE_STATUS.indexOf(name)!==-1) return;      // skip Expired
    labels.push(name); data.push(counts[i]); idxs.push(i);
    var c=STATUS_COLOR[name]||'#2E6BA8';
    colors.push((anySel && !sel.has(i))?fadeHex(c):c);
  });
  upsertDonut('chStatus',labels,data,colors,idxs);
}
/* pale version of a #hex colour */
function fadeHex(hex){
  var n=parseInt(hex.slice(1),16);
  var r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  var mix=function(c){return Math.round(c+(255-c)*0.72);};
  return 'rgb('+mix(r)+','+mix(g)+','+mix(b)+')';
}

/* ----- generic dimension bar (fill rate) — click a bar to filter ----- */
function drawDimBar(canvasId,col,key){
  var rows=activeRows(key), g=groupBy(rows,col), names=DATA.dims[key];
  var sel=SEL[key];
  var arr=Object.keys(g).map(function(k){
    return {di:parseInt(k,10),name:names[k],fr:pct(g[k].grnV,g[k].poV),
            poV:g[k].poV,gap:g[k].poV-g[k].grnV};
  }).sort(function(x,y){return y.poV-x.poV;});
  var anySel=sel && sel.size>0;
  var colors=arr.map(function(d){
    var c=barColor(d.fr);
    // when something is selected, fade the bars that aren't
    return (anySel && !sel.has(d.di)) ? fade(c) : c;
  });
  upsertBar(canvasId,arr.map(function(d){return d.name;}),
            arr.map(function(d){return d.fr;}),colors,arr,false,key);
}
/* pale version of a colour, for un-selected bars */
function fade(rgb){
  var m=rgb.match(/(\d+),\s*(\d+),\s*(\d+)/); if(!m) return rgb;
  var mix=function(c){return Math.round(+c+(255-+c)*0.72);};
  return 'rgb('+mix(m[1])+','+mix(m[2])+','+mix(m[3])+')';
}

/* ----- city x PO status: DISTINCT PO counts (Full / Partial / Zero) ----- */
var CITY_STATUS=['Fully Supplied','Partially Supplied','Zero Supply'];
/* sort state for the city table — default: most POs first */
var citySort={col:'total',dir:-1};

function drawCityStatus(){
  var rows=activeRows('city');   // ignore the city filter so every city stays clickable
  var names=DATA.dims.city, dimStatus=DATA.dims.status;
  var sIdx=CITY_STATUS.map(function(s){return dimStatus.indexOf(s);});
  var g={};   // city -> {sets:[Set,Set,Set], all:Set}
  for(var i=0;i<rows.length;i++){
    var r=rows[i], k=r[C.city];
    var o=g[k]||(g[k]={sets:[new Set(),new Set(),new Set()],all:new Set()});
    var poId=r[C.po];
    o.all.add(poId);
    var p=sIdx.indexOf(r[C.status]);
    if(p!==-1) o.sets[p].add(poId);
  }
  var arr=Object.keys(g).map(function(k){
    var o=g[k], full=o.sets[0].size, total=o.all.size;
    return {di:parseInt(k,10),name:names[k],full:full,part:o.sets[1].size,
            zero:o.sets[2].size,total:total,pctFull:pct(full,total)};
  });
  var sc=citySort.col,dir=citySort.dir;
  arr.sort(function(x,y){
    var d=(x[sc]<y[sc]?-1:x[sc]>y[sc]?1:0)*dir;
    return d!==0?d:(x.total<y.total?1:x.total>y.total?-1:0);   // tie-break on size
  });

  var cols=[
    {k:'name',t:'CITY'},
    {k:'full',t:'Fully supplied'},
    {k:'part',t:'Partially supplied'},
    {k:'zero',t:'Zero supply'},
    {k:'total',t:'Total POs'},
    {k:'pctFull',t:'% full'}
  ];
  var CT={full:0,part:0,zero:0,total:0};
  arr.forEach(function(d){CT.full+=d.full;CT.part+=d.part;CT.zero+=d.zero;CT.total+=d.total;});
  var ctPct=pct(CT.full,CT.total);
  var html='<table class="mini"><thead><tr>'+cols.map(function(c){
    return '<th data-k="'+c.k+'" class="'+(c.k===sc?'sorted':'')+'">'+
           c.t+(c.k===sc?(dir<0?' ▾':' ▴'):'')+'</th>';
  }).join('')+'</tr><tr class="totalrow">'+
    '<td>TOTAL</td>'+
    '<td class="ok">'+fmt(CT.full)+'</td>'+
    '<td class="warn">'+fmt(CT.part)+'</td>'+
    '<td class="bad">'+fmt(CT.zero)+'</td>'+
    '<td><b>'+fmt(CT.total)+'</b></td>'+
    '<td><span class="frtag '+frClass(ctPct)+'">'+ctPct+'%</span></td></tr></thead><tbody>';
  if(!arr.length) html+='<tr><td colspan="6"><div class="empty">No rows match the current filters.</div></td></tr>';
  var selCity=SEL.city;
  arr.forEach(function(d){
    var on=selCity && selCity.has(d.di);
    html+='<tr class="clickable'+(on?' picked':'')+'" data-di="'+d.di+'">'+
      '<td title="'+d.name+'">'+d.name+'</td>'+
      '<td class="ok">'+fmt(d.full)+'</td>'+
      '<td class="warn">'+fmt(d.part)+'</td>'+
      '<td class="bad">'+fmt(d.zero)+'</td>'+
      '<td><b>'+fmt(d.total)+'</b></td>'+
      '<td><span class="frtag '+frClass(d.pctFull)+'">'+d.pctFull+'%</span></td></tr>';
  });
  html+='</tbody></table>';
  var wrap=document.getElementById('cityStatusWrap');
  wrap.innerHTML=html;
  wrap.querySelectorAll('th').forEach(function(th){
    th.onclick=function(){
      var k=th.getAttribute('data-k');
      if(citySort.col===k) citySort.dir*=-1;              // same header = flip direction
      else {citySort.col=k; citySort.dir=(k==='name')?1:-1;}  // text A-Z, numbers high-to-low
      drawCityStatus();
    };
  });
  wrap.querySelectorAll('tr.clickable').forEach(function(tr){
    tr.onclick=function(){toggleSelection('city',parseInt(tr.getAttribute('data-di'),10));};
  });
}

/* ----- drill table ----- */
var mmdOfSkuIdx=[];  // cache: sku index -> {key,name,code} (avoids recomputing per row)
function skuGroupOf(idx){
  var cached=mmdOfSkuIdx[idx]; if(cached) return cached;
  var grp = window.mmdGroup ? window.mmdGroup(DATA.dims.sku[idx]) : {key:'sku:'+idx,name:DATA.dims.sku[idx],code:''};
  mmdOfSkuIdx[idx]=grp;
  return grp;
}
function drawTable(){
  /* drillDim can be a plain dimension ('sku','city','category','trade'),
     the SKU x City pair ('skucity') or the PO date ('date').
     For 'sku'/'skucity', trade SKUs sharing one MMD Item Code merge into one row. */
  var pair=(drillDim==='skucity'), byDate=(drillDim==='date'), isSku=(drillDim==='sku');
  var mmdCols=isSku||pair;
  var col=pair||byDate?null:C[drillDim], names=pair||byDate?null:DATA.dims[drillDim];
  var qty=(metricMode==='qty');
  var oCol=qty?C.poQty:C.poVal, gCol=qty?C.grnQty:C.grnVal;
  var rows=activeRows(null), g={};
  function bucket(k,nm,sub,mmdCode,mmdName){
    var o=g[k];
    if(!o){ o={name:nm,sub:sub||'',mmdCode:mmdCode||'',mmdName:mmdName||'',poV:0,grnV:0,lines:0}; g[k]=o; }
    return o;
  }
  for(var i=0;i<rows.length;i++){
    var r=rows[i], o;
    if(isSku){
      var grp=skuGroupOf(r[C.sku]);
      o=bucket(grp.key,grp.name,'',grp.code,grp.code?grp.name:'');
    } else if(pair){
      var grp2=skuGroupOf(r[C.sku]);
      o=bucket(grp2.key+'|'+r[C.city],grp2.name,DATA.dims.city[r[C.city]],grp2.code,grp2.code?grp2.name:'');
    } else if(byDate){
      o=bucket(r[C.date],fmtYMD(r[C.date]));
    } else {
      o=bucket(r[col],names[r[col]]);
    }
    o.poV+=r[oCol];o.grnV+=r[gCol];o.lines++;
  }
  var arr=Object.keys(g).map(function(k){
    var o=g[k];
    return {name:o.name,sub:o.sub,mmdCode:o.mmdCode,mmdName:o.mmdName,
            poV:o.poV,grnV:o.grnV,gap:o.poV-o.grnV,
            fr:pct(o.grnV,o.poV),lines:o.lines};
  });
  var TOT={poV:0,grnV:0,gap:0,lines:0};
  arr.forEach(function(d){TOT.poV+=d.poV;TOT.grnV+=d.grnV;TOT.gap+=d.gap;TOT.lines+=d.lines;});
  TOT.fr=pct(TOT.grnV,TOT.poV);
  var sc=sortState.col,dir=sortState.dir;
  arr.sort(function(x,y){return (x[sc]<y[sc]?-1:x[sc]>y[sc]?1:0)*dir;});
  arr=arr.slice(0,25);

  var unit=qty?' Qty':' ₹L';
  document.getElementById('gapHint').textContent=
    (pair?'Top 25 SKU × City combinations by ':'Top 25 by ')+(qty?'quantity':'value')+
    ' gap in the current selection · click a header to sort';
  var cols=[
    {k:'name',t:pair?'SKU':byDate?'PO DATE':drillDim.toUpperCase()},
    pair?{k:'sub',t:'CITY'}:null,
    mmdCols?{k:'mmdCode',t:'MMD ITEM CODE'}:null,
    mmdCols?{k:'mmdName',t:'MMD SKU NAME'}:null,
    {k:'fr',t:'FR %'},
    {k:'poV',t:'PO'+unit},
    {k:'grnV',t:(qty?'GRN Qty':'GRN ₹L')},
    {k:'gap',t:'Gap'+unit},
    {k:'lines',t:'Lines'}
  ].filter(Boolean);
  var html='<table><thead><tr>'+cols.map(function(c){
    return '<th data-k="'+c.k+'" class="'+(c.k===sc?'sorted':'')+'">'+c.t+(c.k===sc?(dir<0?' ▾':' ▴'):'')+'</th>';
  }).join('')+'</tr><tr class="totalrow">'+
    '<td>TOTAL</td>'+
    (pair?'<td></td>':'')+
    (mmdCols?'<td></td><td></td>':'')+
    '<td><span class="frtag '+frClass(TOT.fr)+'">'+TOT.fr+'%</span></td>'+
    '<td>'+fmt(TOT.poV)+'</td><td>'+fmt(TOT.grnV)+'</td>'+
    '<td class="gapneg">'+fmt(TOT.gap)+'</td>'+
    '<td>'+fmt(TOT.lines)+'</td></tr></thead><tbody>';
  if(!arr.length){html+='<tr><td colspan="'+cols.length+'"><div class="empty">No rows match the current filters.</div></td></tr>';}
  arr.forEach(function(d){
    var icon = mmdCols && window.matchSkuIcon ? window.matchSkuIcon(d.name) : null;
    var nameCell = icon
      ? '<span class="skuname"><img class="skuicon" src="'+icon+'" alt=""> '+d.name+'</span>'
      : d.name;
    html+='<tr><td title="'+d.name+'">'+nameCell+'</td>'+
      (pair?'<td title="'+d.sub+'">'+d.sub+'</td>':'')+
      (mmdCols?'<td>'+(d.mmdCode||'—')+'</td><td>'+(d.mmdName||'—')+'</td>':'')+
      '<td><span class="frtag '+frClass(d.fr)+'">'+d.fr+'%</span></td>'+
      '<td>'+fmt(d.poV)+'</td><td>'+fmt(d.grnV)+'</td>'+
      '<td class="'+(d.gap>0?'gapneg':'')+'">'+fmt(d.gap)+'</td>'+
      '<td>'+fmt(d.lines)+'</td></tr>';
  });
  html+='</tbody></table>';
  var wrap=document.getElementById('tableWrap'); wrap.innerHTML=html;
  wrap.querySelectorAll('th').forEach(function(th){
    th.onclick=function(){
      var k=th.getAttribute('data-k');
      if(sortState.col===k) sortState.dir*=-1;
      else {sortState.col=k; sortState.dir=(k==='name')?1:-1;}
      drawTable();
    };
  });
}

/* ========================================================================
   CHART.JS wrappers (guarded — dashboard still works without the CDN)
   ======================================================================== */
var HASCHART=typeof Chart!=='undefined';
var HASLABELS=typeof ChartDataLabels!=='undefined';
if(HASCHART){
  Chart.defaults.font.family="Inter, sans-serif";
  Chart.defaults.font.size=11.5;
  Chart.defaults.color="#6B7A90";
  if(HASLABELS) Chart.register(ChartDataLabels);
}
function tip(arr){ // shared tooltip showing PO value + gap
  return {callbacks:{afterLabel:function(ctx){
    var d=arr&&arr[ctx.dataIndex]; if(!d)return '';
    return 'PO ₹'+fmt(d.poV)+'L · Gap ₹'+fmt(d.gap)+'L';
  }}};
}
function upsertBar(id,labels,data,colors,meta,horizontal,dimKey){
  if(!HASCHART) return;
  var cfg={type:'bar',data:{labels:labels,datasets:[{data:data,backgroundColor:colors,
      borderRadius:5,maxBarThickness:46}]},
    options:{indexAxis:horizontal?'y':'x',responsive:true,maintainAspectRatio:false,
      layout:{padding:horizontal?{right:34}:{top:26}},
      onHover:dimKey?function(ev,els){
        ev.native.target.style.cursor=els.length?'pointer':'default';
      }:undefined,
      onClick:dimKey?function(ev,els){
        if(!els.length) return;
        var d=meta&&meta[els[0].index];
        if(d) toggleSelection(dimKey,d.di);
      }:undefined,
      plugins:{legend:{display:false},tooltip:tip(meta),
        datalabels:HASLABELS?{
          anchor:'end',
          align:horizontal?'right':'top',
          offset:4,
          clamp:true,
          color:'#0D2A5C',
          font:{weight:'700',size:11.5},
          formatter:function(v){return v+'%';}
        }:false},
      scales:horizontal?
        {x:{max:100,ticks:{callback:function(v){return v+'%';}},grid:{color:'#EDF1F6'}},
         y:{grid:{display:false}}}:
        {y:{max:100,ticks:{callback:function(v){return v+'%';}},grid:{color:'#EDF1F6'}},
         x:{grid:{display:false}}}}};
  swap(id,cfg);
}
function upsertLine(id,labels,series){
  if(!HASCHART) return;
  var cfg={type:'line',data:{labels:labels,datasets:series.map(function(s){
      return {label:s.label,data:s.data,borderColor:s.color,backgroundColor:s.fill?'rgba(20,64,110,.10)':'transparent',
              fill:s.fill,tension:.3,borderWidth:2.5,pointRadius:3,pointBackgroundColor:s.color};})},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'top',align:'end',labels:{boxWidth:12,boxHeight:12,usePointStyle:true}},
        datalabels:{display:false}},
      scales:{y:{min:0,max:100,ticks:{callback:function(v){return v+'%';}},grid:{color:'#EDF1F6'}},
              x:{grid:{display:false}}}}};
  swap(id,cfg);
}
function upsertDonut(id,labels,data,colors,idxs){
  if(!HASCHART) return;
  var cfg={type:'doughnut',data:{labels:labels,datasets:[{data:data,backgroundColor:colors,borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'62%',
      onHover:idxs?function(ev,els){
        ev.native.target.style.cursor=els.length?'pointer':'default';
      }:undefined,
      onClick:idxs?function(ev,els){
        if(els.length) toggleSelection('status',idxs[els[0].index]);
      }:undefined,
      plugins:{legend:{position:'bottom',labels:{boxWidth:11,boxHeight:11,padding:10,usePointStyle:true}},
        datalabels:{display:false}}}};
  swap(id,cfg);
}
function swap(id,cfg){
  if(charts[id]) charts[id].destroy();
  charts[id]=new Chart(document.getElementById(id),cfg);
}

/* ========================================================================
   SLICERS UI
   ======================================================================== */
function ymdInt(v){return v?parseInt(v.replace(/-/g,''),10):null;}
function ymdToStr(y){var s=String(y);return s.length===8?s.slice(0,4)+'-'+s.slice(4,6)+'-'+s.slice(6,8):'';}

/* Slicers can be mounted in several places (top bar + inside the table card).
   Every mounted control reads/writes the SAME SEL/DATE state, and syncAll()
   refreshes them all so the two bars never drift apart. */
var slicerReg=[];      // {key,btn,list} per mounted dropdown
var dateReg=[];        // {from,to} per mounted date range
var slicerUid=0, bodyCloseBound=false;

function updateBtn(btn,key){
  var set=SEL[key], n=set.size, total=DATA.dims[key].length;
  if(n===0||n===total){btn.textContent='All'; btn.classList.remove('active');}
  else if(n===1){btn.textContent=DATA.dims[key][set.values().next().value]; btn.classList.add('active');}
  else{btn.innerHTML='<span class="cnt">'+n+'</span> selected'; btn.classList.add('active');}
}
function syncAll(){
  slicerReg.forEach(function(reg){
    updateBtn(reg.btn,reg.key);
    var set=SEL[reg.key];
    reg.list.querySelectorAll('input[type=checkbox]').forEach(function(c){
      c.checked=set.has(parseInt(c.value,10));
    });
  });
  var mn=DATA.meta.date_min, mx=DATA.meta.date_max;
  dateReg.forEach(function(d){
    d.from.value=DATE.from?ymdToStr(DATE.from):mn;
    d.to.value  =DATE.to?  ymdToStr(DATE.to):mx;
    d.from.classList.toggle('active',!!DATE.from);
    d.to.classList.toggle('active',!!DATE.to);
  });
}
function updateSlicerButtons(){ syncAll(); }   // render() calls this at its end

function makeSlicer(host,sl,before){
  if(!SEL[sl.key]) SEL[sl.key]=new Set();
  var uid='s'+(slicerUid++);
  var wrap=document.createElement('div'); wrap.className='slicer slicer-'+sl.key;
  wrap.innerHTML=
    '<label>'+sl.label+'</label>'+
    '<button class="slicer-btn" data-key="'+sl.key+'">All</button>'+
    '<div class="panel-pop" data-pop="'+sl.key+'">'+
      '<input class="search" placeholder="Search '+sl.label.toLowerCase()+'\u2026">'+
      '<div class="pop-acts"><button data-act="all">Select all</button><button data-act="clear">Clear</button></div>'+
      '<div class="opt-list"></div>'+
    '</div>';
  if(before) host.insertBefore(wrap,before); else host.appendChild(wrap);
  var pop=wrap.querySelector('.panel-pop'), list=wrap.querySelector('.opt-list'), btn=wrap.querySelector('.slicer-btn');
  DATA.dims[sl.key].forEach(function(name,idx){
    var row=document.createElement('div'); row.className='opt';
    var id=uid+'_'+idx;
    row.innerHTML='<input type="checkbox" id="'+id+'" value="'+idx+'"><label for="'+id+'">'+name+'</label>';
    row.querySelector('input').onchange=function(e){
      if(e.target.checked) SEL[sl.key].add(idx); else SEL[sl.key].delete(idx);
      render();
    };
    list.appendChild(row);
  });
  btn.onclick=function(e){
    e.stopPropagation();
    var wasOpen=pop.classList.contains('open');
    document.querySelectorAll('.panel-pop').forEach(function(p){p.classList.remove('open');});
    if(!wasOpen) pop.classList.add('open');
  };
  pop.onclick=function(e){e.stopPropagation();};
  wrap.querySelector('.search').oninput=function(e){
    var q=e.target.value.toLowerCase();
    list.querySelectorAll('.opt').forEach(function(o){o.style.display=o.textContent.toLowerCase().indexOf(q)>-1?'':'none';});
  };
  wrap.querySelector('[data-act="all"]').onclick=function(){
    DATA.dims[sl.key].forEach(function(_,idx){SEL[sl.key].add(idx);}); render();
  };
  wrap.querySelector('[data-act="clear"]').onclick=function(){ SEL[sl.key].clear(); render(); };
  slicerReg.push({key:sl.key,btn:btn,list:list});
}

function makeDate(host,before){
  var mn=DATA.meta.date_min, mx=DATA.meta.date_max;
  var wrap=document.createElement('div'); wrap.className='slicer slicer-date';
  wrap.innerHTML=
    '<label>PO Date range</label>'+
    '<div class="date-row">'+
      '<input type="date" class="d-from" min="'+mn+'" max="'+mx+'" value="'+mn+'">'+
      '<span>\u2192</span>'+
      '<input type="date" class="d-to" min="'+mn+'" max="'+mx+'" value="'+mx+'">'+
    '</div>';
  wrap.querySelector('.date-row').insertAdjacentHTML('afterend',
    '<div class="date-presets">'+
      '<button data-days="7">7D</button><button data-days="30">30D</button>'+
      '<button data-days="0">MTD</button><button data-days="-1">All</button>'+
    '</div>');
  if(before) host.insertBefore(wrap,before); else host.appendChild(wrap);
  var from=wrap.querySelector('.d-from'), to=wrap.querySelector('.d-to');
  wrap.querySelector('.date-presets').onclick=function(e){
    var b=e.target.closest('button'); if(!b) return;
    var days=parseInt(b.getAttribute('data-days'),10);
    if(days===-1){ DATE.from=null; DATE.to=null; }
    else if(days===0){ DATE.from=ymdInt(mx.slice(0,7)+'-01'); DATE.to=null; }
    else {
      var dt=new Date(mx+'T00:00:00Z');
      dt.setUTCDate(dt.getUTCDate()-(days-1));
      DATE.from=ymdInt(dt.toISOString().slice(0,10)); DATE.to=null;
    }
    render();
  };
  function apply(){
    DATE.from=(from.value&&from.value!==mn)?ymdInt(from.value):null;
    DATE.to  =(to.value&&to.value!==mx)?ymdInt(to.value):null;
    render();
  }
  from.onchange=apply; to.onchange=apply;
  dateReg.push({from:from,to:to});
}

function buildSlicers(){
  slicerReg=[]; dateReg=[];
  var host=document.getElementById('slicers');
  var reset=host.querySelector('.reset-slicer');
  Array.prototype.slice.call(host.querySelectorAll('.slicer')).forEach(function(n){n.remove();});
  SLICERS.forEach(function(sl){SEL[sl.key]=new Set();});
  makeDate(host,reset);
  SLICERS.forEach(function(sl){ makeSlicer(host,sl,reset); });
  if(!bodyCloseBound){
    document.body.addEventListener('click',function(){
      document.querySelectorAll('.panel-pop').forEach(function(p){p.classList.remove('open');});
    });
    bodyCloseBound=true;
  }
}

/* ========================================================================
   CSV export of the current (filtered) detail
   ======================================================================== */
function exportCSV(){
  var rows=activeRows(null), d=DATA.dims;
  var head=['PO Date','Month','Trade','Region','City','Category','SKU Name','Status','PO Qty','PO Value (L)','GRN Qty','GRN Value (L)','Gap Value (L)'];
  var lines=[head.join(',')];
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    lines.push([
      fmtYMD(r[C.date]),
      d.month[r[C.month]],d.trade[r[C.trade]],d.region[r[C.region]],d.city[r[C.city]],
      d.category[r[C.category]],'"'+String(d.sku[r[C.sku]]).replace(/"/g,'""')+'"',
      d.status[r[C.status]],r[C.poQty],r[C.poVal],r[C.grnQty],r[C.grnVal],
      (r[C.poVal]-r[C.grnVal]).toFixed(4)
    ].join(','));
  }
  var blob=new Blob([lines.join('\n')],{type:'text/csv'});
  var url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download='trade_fr_filtered.csv'; a.click();
  URL.revokeObjectURL(url);
}

/* ========================================================================
   LOAD A FRESH EXCEL/CSV (rebuilds the indexed structure in-browser)
   ======================================================================== */
var MONTH_ORDER=['January','February','March','April','May','June','July','August','September','October','November','December'];
var STATUS_MAP={'Fully Supplied':'Fully Supplied','Fully Supplied Po':'Fully Supplied','Po Fully Supplied':'Fully Supplied',
  'COMPLETED':'Fully Supplied','GRN_DONE':'Fully Supplied','Po Partially Supplied':'Partially Supplied',
  'Zero Supply':'Zero Supply','EXPIRED':'Expired'};
function titleCase(s){return String(s||'').trim().toLowerCase().replace(/\b\w/g,function(m){return m.toUpperCase();});}
function toYMD(v){
  if(v instanceof Date && !isNaN(v)) return v.getFullYear()*10000+(v.getMonth()+1)*100+v.getDate();
  var s=String(v||'').trim(); if(!s) return 0;
  var m=s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if(m) return (+m[1])*10000+(+m[2])*100+(+m[3]);
  var d=new Date(s); return isNaN(d)?0:d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
}

function buildFromObjects(recs){
  var dims={month:[],trade:[],region:[],city:[],category:[],status:[],sku:[]};
  var maps={month:{},trade:{},region:{},city:{},category:{},status:{},sku:{}};
  function id(dim,val){var m=maps[dim];if(!(val in m)){m[val]=dims[dim].length;dims[dim].push(val);}return m[val];}
  var poMap={},poN=0;
  function poId(v){var k=String(v||'').trim();if(!(k in poMap))poMap[k]=poN++;return poMap[k];}
  var rows=[];
  recs.forEach(function(o){
    var status=STATUS_MAP[String(o['PO Status']||'').trim()]||'Other';
    var rec=[
      id('month',String(o['Month']||'').trim()),
      id('trade',String(o['Trade']||'').trim()),
      id('region',titleCase(o['Region'])),
      id('city',titleCase(o['City'])),
      id('category',String(o['Category']||'').trim()),
      id('status',status),
      id('sku',String(o['SKU Name']||'').trim()),
      Math.round(+o['PO Qty']||0),+(+o['Po Value']||0).toFixed(4),
      Math.round(+o['GRN Qty']||0),+(+o['GRN Value']||0).toFixed(4),
      toYMD(o['Po Date']),
      poId(o['PO Number'])
    ];
    rows.push(rec);
  });
  // sort month dim into calendar order (rebuild indices)
  var order=dims.month.map(function(m){return MONTH_ORDER.indexOf(m);});
  var perm=dims.month.map(function(_,i){return i;}).sort(function(a,b){return order[a]-order[b];});
  var remap={}; perm.forEach(function(oldi,newi){remap[oldi]=newi;});
  dims.month=perm.map(function(oldi){return dims.month[oldi];});
  rows.forEach(function(r){r[C.month]=remap[r[C.month]];});
  var ymds=rows.map(function(r){return r[C.date];}).filter(function(y){return y>0;});
  var dmin=ymds.length?Math.min.apply(null,ymds):0, dmax=ymds.length?Math.max.apply(null,ymds):0;
  return {meta:{rows:rows.length,generated:new Date().toISOString().slice(0,16).replace('T',' '),
          value_unit:'lakh',po_count:poN,
          date_min:fmtYMD(dmin)||'2000-01-01',date_max:fmtYMD(dmax)||'2099-12-31'},
          dims:dims,rows:rows};
}
function loadFile(file){
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var wb=XLSX.read(e.target.result,{type:'array',cellDates:true});
      var sheet=wb.Sheets['Raw Data']||wb.Sheets[wb.SheetNames[0]];
      var recs=XLSX.utils.sheet_to_json(sheet,{defval:''});
      DATA=buildFromObjects(recs);
      init(true);
    }catch(err){ alert('Could not read that file. Make sure it has a "Raw Data" sheet with the trade columns.\n\n'+err.message); }
  };
  reader.readAsArrayBuffer(file);
}

/* ========================================================================
   INIT
   ======================================================================== */
function init(rebuild){
  mmdOfSkuIdx=[];   // sku indices can be reused across datasets; drop the stale cache
  setMeta();
  document.getElementById('footnote').innerHTML=
    'Cleaning applied: city names normalised to Title Case (merged duplicate casings); '+
    'PO status collapsed to <code>Fully Supplied · Partially Supplied · Zero Supply · Expired</code> '+
    '(<code>Expired</code> is hidden from the status donut and the city PO-count table, but still counts in totals — '+
    'use the Status slicer to exclude it everywhere); '+
    'missing GRN quantities treated as 0. Fill rate = supplied ÷ ordered, aggregated (not row-averaged). '+
    'Value figures are shown in <code>₹ Lakh</code> as stored in the source — tell me if the unit is different and I\'ll relabel.';
  buildSlicers();
  render();
}

document.getElementById('exportBtn').onclick=exportCSV;
document.getElementById('resetBtn').onclick=function(){
  SLICERS.forEach(function(sl){SEL[sl.key].clear();});
  DATE={from:null,to:null};
  render();
};
document.getElementById('fileInput').onchange=function(e){
  if(e.target.files[0]) loadFile(e.target.files[0]);
};
document.getElementById('metricChips').onclick=function(e){
  var b=e.target.closest('button'); if(!b)return;
  metricMode=b.getAttribute('data-metric');
  this.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);});
  drawTable();
};
document.getElementById('drillChips').onclick=function(e){
  var b=e.target.closest('button'); if(!b)return;
  drillDim=b.getAttribute('data-dim');
  this.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b);});
  sortState=(drillDim==='date')?{col:'name',dir:1}:{col:'gap',dir:-1};
  drawTable();
};

/* ========================================================================
   LIVE AUTO-UPDATE — polls /api/data (Neon DB, updated instantly by uploads)
   ======================================================================== */
var LIVE=false, lastGen=null;
function setMeta(){
  var m=DATA.meta;
  document.getElementById('metaBox').innerHTML=
    fmt(DATA.rows.length)+' PO lines'+(m.po_count?' · '+fmt(m.po_count)+' POs':'')+
    '<br>'+(LIVE?'<span style="color:#7CFFC4">● live</span> · ':'')+'updated '+(m.generated||'');
}
function snapshotFilters(){
  var snap={sel:{},from:DATE.from,to:DATE.to};
  SLICERS.forEach(function(sl){
    snap.sel[sl.key]=new Set(Array.from(SEL[sl.key]).map(function(i){return DATA.dims[sl.key][i];}));
  });
  return snap;
}
function restoreFilters(snap){
  SLICERS.forEach(function(sl){
    var names=snap.sel[sl.key]; if(!names||!names.size) return;
    DATA.dims[sl.key].forEach(function(name,idx){ if(names.has(name)) SEL[sl.key].add(idx); });
  });
  var mn=ymdInt(DATA.meta.date_min), mx=ymdInt(DATA.meta.date_max);
  DATE.from=(snap.from&&snap.from>=mn&&snap.from<=mx)?snap.from:null;
  DATE.to  =(snap.to  &&snap.to  >=mn&&snap.to  <=mx)?snap.to  :null;
}
function applyNewData(nd){
  var snap=snapshotFilters();
  DATA=nd; DATE={from:null,to:null};
  init(true);
  restoreFilters(snap);
  setMeta();
  render();
}
function startLive(){
  if(location.protocol.indexOf('http')!==0) return;  // only when served (not file://)
  LIVE=true; lastGen=DATA.meta.generated; setMeta();
  setInterval(function(){
    fetch('/api/data?_='+Date.now()).then(function(r){return r.json();}).then(function(nd){
      if(nd&&nd.meta&&nd.meta.generated!==lastGen){ lastGen=nd.meta.generated; applyNewData(nd); }
    }).catch(function(){});
  },5000);
}

/* boot */
if(window.TRADE_FR){ DATA=window.TRADE_FR; init(false); startLive(); }
else if(location.protocol.indexOf('http')===0){
  fetch('/api/data?_='+Date.now()).then(function(r){return r.json();})
    .then(function(nd){DATA=nd; init(false); startLive();})
    .catch(function(){document.getElementById('metaBox').textContent='No data found.';});
}
else {
  document.getElementById('metaBox').textContent='No data — click "Load data" and pick the Trade FR Excel file.';
}

})();
