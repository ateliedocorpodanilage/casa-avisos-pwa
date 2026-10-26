const key='casa-avisos-pwa';const RELAY='https://xonhjynkpcawlfxvvuxh.supabase.co/functions/v1/casa-avisos-relay';const saved=JSON.parse(localStorage.getItem(key)||'{}');const state={deviceCode:saved.deviceCode||'',label:saved.label||'TV da sala',tasks:saved.tasks||[]};const $=s=>document.querySelector(s);const save=()=>localStorage.setItem(key,JSON.stringify(state));const presets=[['🚿','Tomar banho','Tomar banho'],['🍽️','Hora de jantar','Hora de jantar'],['📖','Fazer tarefa','Fazer a tarefa'],['⏻','Desligar TV','Desligar a TV']];function status(x){$('#status').textContent=x}function escapeHtml(s){return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}const KIND_BY_PATH=Object.freeze({'/message':'message','/task':'task','/task/done':'task_done','/task/delete':'task_delete','/sound':'sound'});
let latestCommand=null;
async function relay(body,deviceCode=state.deviceCode){
 if(!deviceCode)throw Error('Configure o código privado da TV.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  const response=await fetch(RELAY,{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({...body,deviceCode})});
  const result=await response.json();
  if(!response.ok || result.ok===false){const error=Error('Não foi possível comunicar com a TV.');error.retryable=response.status>=500;throw error;}
  return result;
 }finally{clearTimeout(timer);}
}
async function send(path,data,message){
 const kind=KIND_BY_PATH[path];
 if(!Object.hasOwn(KIND_BY_PATH,path)){status('Comando inválido.');return false;}
 const commandId=crypto.randomUUID(),deviceCode=state.deviceCode;
 latestCommand=commandId;status('Enviando…');
 const body={kind,payload:data,commandId};
 for(let attempt=0;attempt<3;attempt++){
  try{
   const result=await relay(body,deviceCode);
   if(!result.id)throw Error('Resposta inválida do servidor.');
   if(latestCommand===commandId)status('SENT — enviado; aguardando recebimento na TV.');
   watchDelivery(result.id,deviceCode,commandId);
   return true;
  }catch(error){
   if(error.retryable===false || attempt===2){
    if(latestCommand===commandId)status(state.deviceCode?'Envio sem confirmação. Verifique a conexão.':'Configure o código privado da TV.');
    return false;
   }
   await new Promise(resolve=>setTimeout(resolve,500*(attempt+1)));
  }
 }
}
async function watchDelivery(id,deviceCode,commandId){
 const labels={SENT:'Enviado; aguardando a TV',RECEIVED:'Recebido pela TV; aguardando exibição',DISPLAYED:'Exibição confirmada pela TV',ACKNOWLEDGED:'Leitura confirmada na TV'};
 for(let i=0;i<200 && latestCommand===commandId && state.deviceCode===deviceCode;i++){
  try{
   const result=await relay({action:'status',id},deviceCode);
   if(latestCommand!==commandId)return;
   if(labels[result.status])status(result.status+' — '+labels[result.status]+'.');
   if(result.status==='ACKNOWLEDGED')return;
  }catch(error){/* Keep the last verified delivery state during outages. */}
  await new Promise(resolve=>setTimeout(resolve,3000));
 }
}
function check(){
 relay({action:'health'}).then(result=>{
  $('#connection').textContent=result.online?'TV conectada (heartbeat)':'TV sem conexão recente';
  $('#dot').style.background=result.online?'#169b68':'#c58a22';
 }).catch(()=>{$('#connection').textContent=state.deviceCode?'TV sem conexão recente':'Configure o código';$('#dot').style.background='#c58a22';});
}
function render(){document.querySelector('#tvName').textContent=state.label;$('#tvCode').value=state.deviceCode;$('#tvLabel').value=state.label;$('#tasks').innerHTML=state.tasks.length?state.tasks.map((x,i)=>`<div class="task-row"><span>${escapeHtml(x)}</span><button class="done" data-done="${i}">✓</button><button data-del="${i}">×</button></div>`).join(''):'<p class="status">Nenhuma tarefa criada.</p>';document.querySelectorAll('[data-done]').forEach(b=>b.onclick=()=>{const i=+b.dataset.done;state.tasks.splice(i,1);save();render();send('/task/done',{index:i},'Tarefa concluída.')});document.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{const i=+b.dataset.del;state.tasks.splice(i,1);save();render();send('/task/delete',{index:i},'Tarefa excluída.')})}$('#quickGrid').innerHTML=presets.map((x,i)=>`<button class="quick q${i}" data-message="${x[2]}"><span class="qicon">${x[0]}</span><strong>${x[1]}</strong><em>›</em></button>`).join('');document.querySelectorAll('[data-message]').forEach(b=>b.onclick=()=>{$('#message').value=b.dataset.message;$('#message').focus()});$('#send').onclick=()=>{const m=$('#message').value.trim();if(m)send('/message',{message:m},'Aviso enviado.')};$('#addTask').onclick=()=>{const x=prompt('Qual tarefa deseja adicionar?');if(x&&x.trim()){state.tasks.push(x.trim());save();render();send('/task',{task:x.trim()},'Tarefa adicionada.')}};$('#settings').onclick=()=>$('#settingsDialog').showModal();$('#settingsDialog').addEventListener('close',()=>{if($('#settingsDialog').returnValue==='save'){state.deviceCode=$('#tvCode').value.trim();state.label=$('#tvLabel').value.trim()||state.label;save();render();check()}});render();check();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
setInterval(()=>{if(document.visibilityState==='visible')check();},10000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
