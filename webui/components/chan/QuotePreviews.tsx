'use client';

import { useEffect } from 'react';
import styles from '@/styles/5chan/post.module.css';

/**
 * 5chan's quotelink hover (ReplyQuotePreview): hovering a >>N or backlink to a
 * post on this page highlights that post when it is on screen, and otherwise
 * floats a copy of it next to the link. One delegated listener for the whole
 * page, so the hundreds of quotelinks stay plain server-rendered anchors.
 * Desktop only, as in 5chan.
 */
export function QuotePreviews() {
  useEffect(() => {
    let preview: HTMLElement | null = null;
    let highlighted: Element | null = null;

    const clear = () => {
      preview?.remove();
      preview = null;
      highlighted?.classList.remove(styles.highlight);
      highlighted = null;
    };

    const onOver = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="#p"]') : null;
      if (!link || window.matchMedia('(max-width: 640px)').matches) return;
      const target = document.getElementById(link.hash.slice(1));
      const post = target?.querySelector(`.${CSS.escape(styles.reply)}`) ?? (target?.classList.contains(styles.opContainer) ? target : null);
      if (!post) return;
      clear();

      const box = post.getBoundingClientRect();
      if (box.top >= 0 && box.bottom <= window.innerHeight) {
        post.classList.add(styles.highlight);
        highlighted = post;
        return;
      }

      // The copy keeps the ancestors 5chan's selectors expect (.postDesktop, .replyDesktop).
      const copy = post.cloneNode(true) as HTMLElement;
      copy.removeAttribute('id');
      copy.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
      const isOp = post === target;
      const frame = document.createElement('div');
      frame.className = `${styles.replyQuotePreview} ${isOp ? styles.replyQuotePreviewOp : ''}`;
      const desktop = document.createElement('div');
      desktop.className = styles.postDesktop;
      if (isOp) {
        desktop.append(copy);
      } else {
        const reply = document.createElement('div');
        reply.className = styles.replyDesktop;
        reply.append(copy);
        desktop.append(reply);
      }
      frame.append(desktop);
      frame.setAttribute('aria-hidden', 'true');
      Object.assign(frame.style, { position: 'fixed', zIndex: '100', pointerEvents: 'none', left: '0px', top: '0px' });
      // Inside the theme root, so the copy keeps the page's theme variables.
      (link.closest('.yotsuba, .yotsuba-b') ?? document.body).append(frame);

      const anchor = link.getBoundingClientRect();
      const width = frame.offsetWidth;
      const height = frame.offsetHeight;
      const left = anchor.right + 5 + width <= window.innerWidth ? anchor.right + 5 : Math.max(5, anchor.left - width - 5);
      const top = Math.min(Math.max(5, anchor.top - height / 2), window.innerHeight - height - 5);
      Object.assign(frame.style, { left: `${left}px`, top: `${Math.max(5, top)}px` });
      preview = frame;
    };

    const onOut = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('a[href^="#p"]')) clear();
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    window.addEventListener('scroll', clear, { passive: true });
    return () => {
      clear();
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      window.removeEventListener('scroll', clear);
    };
  }, []);

  return null;
}
