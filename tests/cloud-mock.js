window.BookratsAuth.accountStore = uid => {
  const key='test.cloud.'+uid;
  let stopped=false;
  return {
    async load(initial){
      if(window.failCloudLoad)throw Error('Firestore indisponível');
      let saved=localStorage.getItem(key);
      if(!saved){saved=JSON.stringify(initial().state);localStorage.setItem(key,saved);}
      return JSON.parse(saved);
    },
    async save(state){
      if(stopped)throw Error('Sessão encerrada');
      if(window.failCloudSave)throw Error('Gravação negada pelo Firestore');
      await new Promise(resolve=>setTimeout(resolve,10));
      localStorage.setItem(key,JSON.stringify(state));
    },
    async read(){return JSON.parse(localStorage.getItem(key));},
    watch(){return ()=>{};},
    stop(){stopped=true;}
  };
};
window.BookratsAuth.cloudError = e=>e.message;
