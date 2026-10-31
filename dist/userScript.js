/* Home Assistant for TizenBrew 0.1.2 | MIT | No authentication handling. */
(function(){
if(window.top!==window||location.origin!==new URL("http://192.168.68.56").origin||window.__HA_TIZEN_REMOTE__)return;
window.__HA_TV_CONFIG__={"url":"http://192.168.68.56","version":"0.1.2"};
/* Composed-tree navigation for Home Assistant's open shadow components. */
(function () {
  'use strict';
  var selector = 'button,a[href],input:not([type="hidden"]),textarea,select,[tabindex],[contenteditable="true"],[role="button"],[role="switch"],[role="checkbox"],[role="tab"],[role="menuitem"],[role="option"],[role="slider"],[role="combobox"]';
  function parent(node) {
    return node && (node.assignedSlot || node.parentElement || (node.getRootNode && node.getRootNode().host));
  }
  function blocked(node) {
    while (node && node.nodeType === 1) {
      if (node.hidden || node.disabled || node.hasAttribute('inert') || node.getAttribute('aria-hidden') === 'true' || node.getAttribute('aria-disabled') === 'true') return true;
      var style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return true;
      node = parent(node);
    }
    return false;
  }
  function visible(node) {
    if (!node || !node.isConnected || blocked(node)) return false;
    var rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function walk(root, visit) {
    var seen=[];
    function children(node) {
      if (node.shadowRoot) children(node.shadowRoot);
      if (node.tagName === 'SLOT' && node.assignedElements) {
        var assigned=node.assignedElements({flatten:true});
        if (assigned.length) {assigned.forEach(descend);return;}
      }
      for (var child=node.firstElementChild;child;child=child.nextElementSibling) descend(child);
    }
    function descend(node) {
      if (node.nodeType !== 1 || seen.indexOf(node)>=0) return;
      seen.push(node);
      visit(node);
      children(node);
    }
    children(root);
  }
  function collect(root) {
    var result = [];
    walk(root || document, function (node) {
      // HA keeps inactive dashboard tabs at -1; remote arrows must still reach
      // them without changing HA's own roving tabindex or selection state.
      if (!node.matches(selector) || (node.getAttribute('tabindex') === '-1' && node.getAttribute('role') !== 'tab') || !visible(node)) return;
      // A custom host commonly delegates focus to its native shadow control.
      if (node.shadowRoot && collect(node.shadowRoot).length) return;
      result.push(node);
    });
    return result;
  }
  function deepActive() {
    var node = document.activeElement;
    while (node && node.shadowRoot && node.shadowRoot.activeElement) node = node.shadowRoot.activeElement;
    return node;
  }
  function editable(node) {
    while (node && node.nodeType === 1) {
      if (node.tagName === 'INPUT' && ['checkbox','radio','button','submit','reset','image','hidden'].indexOf(node.type)<0) return true;
      if (node.matches('textarea,select,[contenteditable=""],[contenteditable="true"],[role="textbox"],[role="slider"],[role="spinbutton"],[role="combobox"]') || node.isContentEditable) return true;
      node = parent(node);
    }
    return false;
  }
  function dialogScope() {
    var result = null;
    walk(document, function (node) {
      if (!node.matches('dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"],ha-dialog[open],ha-dialog[opened],ha-more-info-dialog[open]')) return;
      if (visible(node)) result = node;
    });
    return result;
  }
  function dashboardBack() {
    var result=null;
    walk(document,function(node) {
      if (result || node.tagName !== 'A' || !node.hasAttribute('href') || !visible(node)) return;
      var url;
      try {url=new URL(node.getAttribute('href'),location.href);} catch(e) {return;}
      if (url.origin !== location.origin || url.href === location.href || url.username || url.password) return;
      var ancestor=parent(node),navigationArrow=false;
      while (ancestor && ancestor.nodeType === 1) {
        if (ancestor.tagName === 'HA-ICON-BUTTON-ARROW-PREV' && ancestor.getAttribute('slot') === 'navigationIcon') navigationArrow=true;
        if (ancestor.tagName === 'HUI-ROOT') {if(navigationArrow) result=node;return;}
        ancestor=parent(ancestor);
      }
    });
    return result;
  }
  function next(current, candidates, direction) {
    if (!candidates.length) return null;
    if (!current || !visible(current)) {
      var inView = candidates.filter(function (node) { var r=node.getBoundingClientRect(); return r.bottom>0 && r.top<window.innerHeight && r.right>0 && r.left<window.innerWidth; });
      return (inView.length ? inView : candidates)[0];
    }
    var from = current.getBoundingClientRect();
    var horizontal = direction === 'left' || direction === 'right';
    var positive = direction === 'right' || direction === 'down';
    var best = null, bestScore = Infinity;
    candidates.forEach(function (node) {
      if (node === current) return;
      var to = node.getBoundingClientRect();
      var dx=(to.left+to.right-from.left-from.right)/2;
      var dy=(to.top+to.bottom-from.top-from.bottom)/2;
      var primary=horizontal?dx:dy, perpendicular=Math.abs(horizontal?dy:dx);
      if ((positive ? primary : -primary) <= 2) return;
      var overlap=horizontal ? Math.min(from.bottom,to.bottom)-Math.max(from.top,to.top) : Math.min(from.right,to.right)-Math.max(from.left,to.left);
      var score=Math.abs(primary)+perpendicular*3+(overlap>0?0:10000);
      if (score<bestScore) {best=node;bestScore=score;}
    });
    return best;
  }
  window.HATVNavigation = {collect:collect,visible:visible,deepActive:deepActive,parent:parent,editable:editable,dialogScope:dialogScope,dashboardBack:dashboardBack,next:next};
}());

(function () {
  'use strict';
  var config = window.__HA_TV_CONFIG__;
  if (window.top !== window || location.origin !== new URL(config.url).origin || window.__HA_TIZEN_REMOTE__) return;
  var nav=window.HATVNavigation;
  var selected=null, ring=null, menu=null, returnFocus=null, hint=null;
  var pressed={}, swallowed={}, suspended=false, frame=0;
  var state={version:config.version};
  window.__HA_TIZEN_REMOTE__=state;

  function key(event) {
    var codes={37:'left',38:'up',39:'right',40:'down',13:'enter',27:'back',10009:'back',403:'menu'};
    var names={ArrowLeft:'left',ArrowUp:'up',ArrowRight:'right',ArrowDown:'down',Enter:'enter',Escape:'back',BrowserBack:'back',GoBack:'back',ColorF0Red:'menu'};
    return codes[event.keyCode] || names[event.key] || '';
  }
  function stop(event) {event.preventDefault();event.stopImmediatePropagation();}
  function mark(node) {
    if (!node || !nav.visible(node)) return;
    selected=node;
    try {node.focus({preventScroll:true});} catch(e) {node.focus();}
    try {node.scrollIntoView({block:'nearest',inline:'nearest'});} catch(e) {node.scrollIntoView(false);}
    paint();
  }
  function paint() {
    if (!ring) return;
    if (!selected || !nav.visible(selected) || suspended) {ring.style.display='none';return;}
    var rect=selected.getBoundingClientRect();
    var container=selected, layer=document.body;
    while(container && container.nodeType===1) {if(container.tagName==='DIALOG' && container.open){layer=container;break;}container=nav.parent(container);}
    if(ring.parentNode!==layer) layer.appendChild(ring);
    ring.style.display='block';
    // A transformed dialog establishes a new containing block for fixed children.
    ring.style.left='0px';ring.style.top='0px';ring.style.width='100px';ring.style.height='100px';
    var origin=ring.getBoundingClientRect(),scaleX=origin.width/100 || 1,scaleY=origin.height/100 || 1;
    ring.style.left=((rect.left-5-origin.left)/scaleX)+'px';ring.style.top=((rect.top-5-origin.top)/scaleY)+'px';
    ring.style.width=((rect.width+10)/scaleX)+'px';ring.style.height=((rect.height+10)/scaleY)+'px';
  }
  function schedulePaint() {if (!frame) frame=requestAnimationFrame(function(){frame=0;paint();});}
  function closeMenu() {
    if (!menu) return;
    document.body.appendChild(ring);
    if(typeof menu.close==='function') menu.close();
    menu.parentNode.removeChild(menu);menu=null;
    if (returnFocus && nav.visible(returnFocus)) mark(returnFocus);
  }
  function showMenu() {
    if (menu) {closeMenu();return;}
    returnFocus=selected || nav.deepActive();
    var supportsModal=typeof HTMLDialogElement!=='undefined' && typeof HTMLDialogElement.prototype.showModal==='function';
    if(!supportsModal && nav.dialogScope()) {showHint('Close the current dialog before opening module controls.');return;}
    menu=document.createElement(supportsModal?'dialog':'div');
    menu.setAttribute('data-ha-tv-menu','');menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','true');menu.setAttribute('aria-label','Home Assistant controls');
    menu.style.cssText='position:fixed;inset:0;margin:0;width:100vw;height:100vh;max-width:none;max-height:none;border:0;padding:0;box-sizing:border-box;z-index:2147483645;display:flex;align-items:center;justify-content:center;background:rgba(5,13,22,.86);font:22px Arial,sans-serif;color:#eef6ff';
    var panel=document.createElement('section');panel.style.cssText='box-sizing:border-box;width:660px;max-width:88vw;padding:40px;background:#132b3d;border:1px solid #42677f;border-radius:24px;box-shadow:0 24px 80px #0008';
    var title=document.createElement('h1');title.textContent='Home Assistant';title.style.cssText='font:600 34px Arial,sans-serif;margin:0 0 14px';panel.appendChild(title);
    var help=document.createElement('p');help.textContent='Arrows move · OK selects · Back returns';help.style.cssText='margin:0 0 28px;color:#b6cede;line-height:1.5';panel.appendChild(help);
    var actions=[['Continue dashboard',closeMenu],['Reload dashboard',function(){location.reload();}],['Open start dashboard',function(){location.assign(config.url);}]];
    actions.forEach(function(action){
      var button=document.createElement('button');button.type='button';button.textContent=action[0];
      button.style.cssText='display:block;box-sizing:border-box;width:100%;text-align:left;padding:18px 22px;margin:12px 0;background:#24445c;color:#fff;border:1px solid #55758b;border-radius:12px;font:24px Arial,sans-serif;cursor:pointer';
      button.addEventListener('click',action[1]);panel.appendChild(button);
    });
    var exitHelp=document.createElement('p');exitHelp.textContent='Hold Back to close this app, then reopen TizenBrew.';exitHelp.style.cssText='color:#b6cede;font:18px Arial,sans-serif;line-height:1.5;margin:24px 0 0';panel.appendChild(exitHelp);
    menu.appendChild(panel);document.body.appendChild(menu);if(supportsModal) menu.showModal();mark(panel.querySelector('button'));
  }
  function closeDialog(dialog) {
    if (dialog.tagName === 'DIALOG' && typeof dialog.close === 'function') {dialog.close();return;}
    var target=nav.deepActive();
    if (!target || target === document.body) target=dialog;
    // HA components own their state; let their Escape handlers close them.
    suspended=true;
    target.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true,composed:true}));
    target.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',code:'Escape',keyCode:27,which:27,bubbles:true,cancelable:true,composed:true}));
    suspended=false;
    showHint('Back closes dialogs where supported. Red opens module controls.');
  }
  function finishEditing(active) {
    // Preserve the field as the navigation anchor after the IME releases focus.
    selected=active;active.blur();paint();
    showHint('Editing finished. Use Up or Down to move to the next field or button.');
  }
  function onDown(event) {
    if (suspended || event.altKey || event.ctrlKey || event.metaKey) return;
    var active=nav.deepActive();
    // Samsung Done/Cancel must blur the input. Do not cancel IME defaults or
    // automatically focus another input, which would reopen the keyboard.
    if (event.keyCode === 65376 || event.keyCode === 65385) {
      if (nav.editable(active)) finishEditing(active);
      return;
    }
    if (event.isComposing) return;
    var action=key(event);if (!action) return;
    if (nav.editable(active) && action !== 'back' && action !== 'menu') return;
    swallowed[action]=true;stop(event);
    var repeated=pressed[action] || event.repeat;pressed[action]=true;
    if (action === 'back') {
      if (repeated) return;
      if (menu) closeMenu();
      else if (nav.editable(active)) finishEditing(active);
      else {
        var dialog=nav.dialogScope();
        if (dialog) closeDialog(dialog);
        else {
          var backLink=nav.dashboardBack();
          if (backLink) backLink.click();else showMenu();
        }
      }
      return;
    }
    if (action === 'menu') {if (!repeated) showMenu();return;}
    if (action === 'enter') {
      if (repeated) return;
      var target=active && active !== document.body ? active : selected;
      var allowed=nav.collect(menu || nav.dialogScope() || document);
      if(allowed.indexOf(target)<0) {if(allowed.length) mark(allowed[0]);return;}
      if (target && nav.visible(target) && typeof target.click === 'function') {mark(target);target.click();}
      return;
    }
    var scope=menu || nav.dialogScope() || document;
    var candidates=nav.collect(scope);
    var current=candidates.indexOf(active)>=0?active:(candidates.indexOf(selected)>=0?selected:null);
    var candidate=nav.next(current,candidates,action);
    if (candidate) mark(candidate);
  }
  function onUp(event) {
    if(suspended) return;
    var action=key(event);delete pressed[action];
    if (swallowed[action]) {delete swallowed[action];stop(event);}
  }
  function showHint(text) {
    if (!hint) return;
    hint.textContent=text;hint.style.opacity='1';
    clearTimeout(state.hintTimer);state.hintTimer=setTimeout(function(){hint.style.opacity='0';},5500);
  }
  function onFocus() {
    var active=nav.deepActive();
    if (active && active !== document.body && nav.visible(active)) {selected=active;schedulePaint();}
  }
  function initialize() {
    ring=document.createElement('div');ring.setAttribute('data-ha-tv-focus','');ring.setAttribute('aria-hidden','true');
    ring.style.cssText='display:none;position:fixed;box-sizing:border-box;pointer-events:none;z-index:2147483647;border:4px solid #4edaff;border-radius:12px;box-shadow:0 0 0 2px #081a29,0 0 24px #4edaff66';
    hint=document.createElement('div');hint.setAttribute('role','status');
    hint.style.cssText='position:fixed;bottom:26px;left:50%;transform:translateX(-50%);max-width:85vw;padding:13px 22px;background:#081a29ed;border:1px solid #436984;border-radius:12px;pointer-events:none;z-index:2147483646;color:#e8f8ff;font:20px Arial,sans-serif;transition:opacity .2s';
    document.body.appendChild(ring);document.body.appendChild(hint);
    window.addEventListener('keydown',onDown,true);window.addEventListener('keyup',onUp,true);
    window.addEventListener('focusin',onFocus,true);window.addEventListener('scroll',schedulePaint,true);window.addEventListener('resize',schedulePaint);
    window.addEventListener('blur',function(){pressed={};swallowed={};});
    showHint('Home Assistant · Arrows move · OK selects · Back opens controls');
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
}());

}());
