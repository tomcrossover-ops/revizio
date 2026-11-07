const { JSDOM, VirtualConsole } = require('jsdom'); const fs = require('fs');
const dir = require('path').join(__dirname, '..') + '/';
exports.make = function make({ store, fetchImpl, sw } = {}) {
  const html = fs.readFileSync(dir + 'index.html', 'utf8').replace(/<script src="[^"]+"><\/script>/g, '');
  const errors = []; const vc = new VirtualConsole(); vc.on('jsdomError', e => errors.push(e.message));
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window; w.scrollTo = () => {};
  if (store) w.localStorage.setItem('revizio.v1', JSON.stringify(store));
  w.fetch = fetchImpl || (async () => { throw new Error('no fetch'); });
  const real = w.setTimeout.bind(w); w.setTimeout = (f, ms, ...a) => real(f, Math.min(ms || 0, 3), ...a);
  w.REVIZIO_NOGUARD = true; w.confirm = () => true; w.prompt = () => 'Mon paquet';
  w.URL.createObjectURL = () => 'blob:x'; w.HTMLAnchorElement.prototype.click = function () { w.__clicked = this.download; };
  if (sw) Object.defineProperty(w.navigator, 'serviceWorker', { value: sw });
  const code = ['core.js', 'theme.js', 'speech.js', 'ai.js', 'catalog.js', 'learn.js', 'exercise.js', 'cards.js', 'session.js', 'pack.js', 'chapter.js', 'app.js'].map(f => fs.readFileSync(dir + f, 'utf8')).join('\n') +
    '\n;window.__t={uniqueQs,qKey,pickExercises,pickTrain,smartPlan,applyCorrections,applyBackup,backupData,sayBtnsLang,enrichAudio,exLabel,lexFind,qHtml,frontSay,sayText,speakable,speak,sayBtns,reserveCount,newAllowedKeys,importPack,courseFromPack,loadPackIndex,buildSession,sameAnswer,keywordFeedback,normQuestions,renderExercise,answerText,addXP,levelOf,rankOf,playerStats,questState,THEMES,applyTheme,tx,computeBadges,XP_GAIN,QUEST,nextInterval,gradeItem,dueItems,newCard,validateCard,importCSV,toCSV,parseCSV,cardLevel,streak,migrate,addDays,today,stateOf,normCards,CATALOG,SUBJECTS,smartPlan,recordQuizResults,courseMastery,computeBadges,recommend,weakQuestions,cardsFromMistakes,skillLevel,prepDays,prepSubjects,suggestChapter,pathNext,pathState,cleanEmoji,cardEmoji,parseJSON,PROVIDERS,switchProvider,callClaude,pingProvider,toOpenAIContent,normQuestions,courseExtras,get db(){return db}};';
  w.eval(code);
  w.document.addEventListener('click', e => { // les tests anciens cliquaient un choix pour répondre : on valide aussitôt (sauf test dédié : w.REVIZIO_NOAUTOOK)
    if (w.REVIZIO_NOAUTOOK) return; const b = e.target.closest && e.target.closest('.choice[data-k]'), ok = b && w.document.getElementById('ok'); if (ok && !ok.disabled) ok.click();
  });
  return { w, errors, t: w.__t, $: s => w.document.querySelector(s), $$: s => [...w.document.querySelectorAll(s)], wait: ms => new Promise(r => setTimeout(r, ms)),
    go: async h => { w.location.hash = h; await new Promise(r => setTimeout(r, 30)); },
    submit: f => f.dispatchEvent(new w.Event('submit', { cancelable: true })), change: e => e.dispatchEvent(new w.Event('change', { bubbles: true })), input: e => e.dispatchEvent(new w.Event('input', { bubbles: true })) };
};
let fails = 0;
exports.check = (name, cond, extra = '') => { if (!cond) fails++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : '  -> ' + extra)); };
exports.done = () => { console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTOUT PASSE'); process.exit(fails ? 1 : 0); };
