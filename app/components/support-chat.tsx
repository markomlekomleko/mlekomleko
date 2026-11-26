"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useLocale, useLocalize } from "../lib/i18n/client";
import { translate } from "../lib/i18n/translate";
import { answerSupportQuestion, getSupportChoices, quickTopicIds, searchSupportFaqs, type SupportReply, type SupportTarget } from "../lib/support-chat";
import { supportMenu, type SupportMenu, type SupportMenuItem } from "../lib/support-menu";
import { SupportChatContact } from "./support-chat-contact";
import styles from "./support-chat.module.css";

type Exchange = { question: string; reply: SupportReply };

export function SupportChat() {
  const localize = useLocalize();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"chat" | "faq">("chat");
  const [contactOpen, setContactOpen] = useState(false);
  const [menuTrail, setMenuTrail] = useState<SupportMenu[]>([]);
  const [browsing, setBrowsing] = useState(true);
  const [draft, setDraft] = useState("");
  const [faqQuery, setFaqQuery] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const widget = useRef<HTMLDivElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const chatButton = useRef<HTMLButtonElement>(null);
  const faqButton = useRef<HTMLButtonElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const contactButton = useRef<HTMLButtonElement>(null);
  const lastExchange = useRef<HTMLDivElement>(null);
  const previousTopic = exchanges.at(-1)?.reply.answers.at(-1)?.topic;
  const choices = getSupportChoices(exchanges.at(-1)?.reply.choices ?? quickTopicIds);
  const currentMenu = menuTrail.at(-1);
  const filteredFaqs = view === "faq" ? searchSupportFaqs(faqQuery, locale) : [];

  useEffect(() => {
    if (open && !contactOpen) (view === "chat" ? chatButton : faqButton).current?.focus({ preventScroll: true });
  }, [open, view, contactOpen]);

  useEffect(() => {
    const messages = log.current;
    if (messages) {
      messages.scrollTop = (browsing ? menu.current : lastExchange.current)?.offsetTop ?? 0;
    }
  }, [open, view, contactOpen, browsing, exchanges, menuTrail]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const root = widget.current;
    if (!open || !viewport || !root) return;
    const fit = () => {
      const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
      root.style.setProperty("--chat-keyboard-offset", `${offset}px`);
      root.style.setProperty("--chat-viewport-height", `${viewport.height}px`);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      root.style.removeProperty("--chat-keyboard-offset");
      root.style.removeProperty("--chat-viewport-height");
    };
  }, [open]);

  function close() {
    setOpen(false);
    launcher.current?.focus({ preventScroll: true });
  }

  function ask(question: string, target?: SupportTarget) {
    const text = question.trim();
    if (!text) return;
    const reply = answerSupportQuestion(text, previousTopic, target);
    setBrowsing(false);
    setExchanges((history) => [...history, { question: text, reply }]);
    setDraft("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(draft);
  }

  function selectMenu(item: SupportMenuItem) {
    if ("children" in item) {
      setMenuTrail((trail) => [...trail, item]);
    } else {
      ask(translate(item.label, locale), item.target);
    }
    log.current?.focus({ preventScroll: true });
  }

  function reset() {
    setMenuTrail([]);
    setBrowsing(true);
    setDraft("");
    setExchanges([]);
    chatButton.current?.focus({ preventScroll: true });
  }

  return localize((
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape closes the widget from any of its controls.
    <div ref={widget} className={styles.widget} onKeyDown={(event) => {
      if (open && event.key === "Escape" && !event.defaultPrevented) {
        event.stopPropagation();
        close();
      }
    }}>
      {open ? (
        <section id="support-chat" className={styles.panel} aria-labelledby="support-chat-title" data-clarity-mask="true">
          <header className={styles.header}>
            <Image src="/images/mleko-i-mleko-logo-mark.png" alt="" width={36} height={36} />
            <div>
              <h2 id="support-chat-title">Pomoć Mleko i Mleko</h2>
              <p>Automatski odgovori</p>
            </div>
            {(exchanges.length > 0 || menuTrail.length > 0) && view === "chat" && !contactOpen ? (
              <button className={styles.reset} type="button" onClick={reset}>Novi razgovor</button>
            ) : null}
          </header>
          <div className={styles.switch} role="group" aria-label="Način pomoći">
            <button ref={chatButton} type="button" aria-pressed={!contactOpen && view === "chat"} onClick={() => { setContactOpen(false); setView("chat"); }}>Razgovor</button>
            <button ref={faqButton} type="button" aria-pressed={!contactOpen && view === "faq"} onClick={() => { setContactOpen(false); setView("faq"); }}>Česta pitanja</button>
          </div>
          {contactOpen ? (
            <SupportChatContact onBack={() => {
              setContactOpen(false);
              requestAnimationFrame(() => contactButton.current?.focus({ preventScroll: true }));
            }} />
          ) : view === "chat" ? (
            <>
              {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keep the scrollable conversation keyboard-accessible. */}
              <div className={styles.log} ref={log} role="log" aria-label="Poruke" tabIndex={0}>
                <p className={styles.reply}>Ćao! Izaberi temu ili napiši svoje pitanje.</p>
                {exchanges.map(({ question, reply }, index) => (
                  <div className={styles.exchange} key={index} ref={index === exchanges.length - 1 ? lastExchange : undefined}>
                    <p className={styles.question} data-no-translate>{question}</p>
                    {reply.prompt ? <p className={styles.reply}>{reply.prompt}</p> : null}
                    {reply.answers.map(({ topic, question: faqQuestion, answer, link }) => (
                      <div className={styles.reply} key={topic}>
                        <p className={styles.answerTitle}>{faqQuestion}</p>
                        <p>{answer}</p>
                        {link ? <Link prefetch={false} href={link.href}>{link.label}</Link> : null}
                      </div>
                    ))}
                    {reply.guides.map(({ message, links }) => (
                      <div className={styles.reply} key={message}>
                        <p>{message}</p>
                        <div className={styles.replyLinks}>
                          {links.map((link) => <Link prefetch={false} href={link.href} key={link.href}>{link.label}</Link>)}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                {browsing ? (
                  <div className={styles.menu} ref={menu}>
                    <div className={styles.menuHeading}>
                      <h3>{currentMenu?.label ?? "Izaberi temu"}</h3>
                      {currentMenu ? (
                        <button className={styles.back} type="button" onClick={() => {
                          setMenuTrail((trail) => trail.slice(0, -1));
                          log.current?.focus({ preventScroll: true });
                        }}>Nazad</button>
                      ) : null}
                    </div>
                    <ul className={styles.menuList}>
                      {(currentMenu?.children ?? supportMenu).map((item) => (
                        <li key={item.label}>
                          <button type="button" onClick={() => selectMenu(item)}>
                            <span>{item.label}</span><span aria-hidden="true">›</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : choices.length ? (
                  <div className={styles.suggestions}>
                    {choices.map(({ id, question }) => (
                      <button key={id} type="button" onClick={() => {
                        ask(translate(question, locale), { topic: id });
                        log.current?.focus({ preventScroll: true });
                      }}>
                        {question}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <form className={styles.form} onSubmit={submit}>
                <input aria-label="Tvoje pitanje" placeholder="Napiši pitanje…" maxLength={300} value={draft} onChange={(event) => setDraft(event.target.value)} autoComplete="off" />
                <button type="submit" disabled={!draft.trim()}>Pošalji</button>
              </form>
            </>
          ) : (
            <>
              <div className={styles.search}>
                <input type="search" aria-label="Pretraži česta pitanja" placeholder="Pretraži česta pitanja" maxLength={120} value={faqQuery} onChange={(event) => setFaqQuery(event.target.value)} />
              </div>
              <div className={styles.faq}>
                {filteredFaqs.map(({ id, question, answer }) => (
                  <details key={id}>
                    <summary>{question}</summary>
                    <p>{answer}</p>
                  </details>
                ))}
                {filteredFaqs.length === 0 ? <p role="status">Nema rezultata. Probaj drugu reč ili nam piši.</p> : null}
                <Link prefetch={false} href="/faq">Sva česta pitanja</Link>
              </div>
            </>
          )}
          {!contactOpen ? (
            <footer className={styles.contact}>
              {view === "chat" && !browsing ? (
                <button type="button" onClick={() => {
                  setBrowsing(true);
                  log.current?.focus({ preventScroll: true });
                }}>Nazad na teme</button>
              ) : null}
              <button ref={contactButton} type="button" onClick={() => setContactOpen(true)}>Ostavi kontakt</button>
            </footer>
          ) : null}
        </section>
      ) : null}
      <button
        ref={launcher}
        type="button"
        className={styles.launcher}
        aria-expanded={open}
        aria-controls={open ? "support-chat" : undefined}
        onClick={() => open ? close() : setOpen(true)}
      >
        <span aria-hidden="true" className={open ? styles.closeIcon : styles.bubble}>{open ? "×" : "···"}</span>
        {open ? "Zatvori pomoć" : "Pomoć"}
      </button>
    </div>
  ));
}
