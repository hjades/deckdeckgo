import {Component, Prop, Watch, Element, Method, EventEmitter, Event, Listen, State, h, Host} from '@stencil/core';

import Prism from 'prismjs';

import {injectCSS} from '@deckdeckgo/utils';

import {loadTheme} from '../../utils/themes-loader.utils';

import {CarbonThemeStyle} from '../styles/deckdeckgo-highlight-code-theme';

import {DeckdeckgoHighlightCodeCarbonTheme} from '../../declarations/deckdeckgo-highlight-code-carbon-theme';
import {DeckdeckgoHighlightCodeAnchor} from '../../declarations/deckdeckgo-highlight-code-anchor';
import {DeckdeckgoHighlightCodeTerminal} from '../../declarations/deckdeckgo-highlight-code-terminal';

import {deckdeckgoHighlightCodeLanguages} from '../../declarations/deckdeckgo-highlight-code-languages';

@Component({
  tag: 'deckgo-highlight-code',
  styleUrl: 'deckdeckgo-highlight-code.scss',
  shadow: true,
})
export class DeckdeckgoHighlightCode {
  @Element() el: HTMLElement;

  @Event() private prismLanguageLoaded: EventEmitter<string>;
  @Event() private codeDidChange: EventEmitter<HTMLElement>;

  @Prop() src: string;

  @Prop() anchor: string = '// DeckDeckGo';
  @Prop() anchorZoom: string = '// DeckDeckGoZoom';
  @Prop() hideAnchor: boolean = true;

  @Prop({reflectToAttr: true}) language: string = 'javascript';

  @Prop({reflectToAttr: true}) highlightLines: string;
  @Prop({reflectToAttr: true}) lineNumbers: boolean = false;

  @Prop({reflectToAttr: true}) terminal: DeckdeckgoHighlightCodeTerminal = DeckdeckgoHighlightCodeTerminal.CARBON;

  @Prop() editable: boolean = false;

  @Prop({reflectToAttr: true}) theme: DeckdeckgoHighlightCodeCarbonTheme = DeckdeckgoHighlightCodeCarbonTheme.DRACULA;

  @State() editing: boolean = false;

  private anchorOffsetTop: number = 0;

  private fetchOrParseAfterUpdate: boolean = false;

  @State()
  private themeStyle: string | undefined;

  async componentWillLoad() {
    await this.loadGoogleFonts();

    await this.loadTheme();
  }

  async componentDidLoad() {
    const languageWasLoaded: boolean = await this.languageDidLoad();

    await this.loadLanguages();

    if (languageWasLoaded) {
      await this.fetchOrParse();
    }
  }

  async componentDidUpdate() {
    if (this.fetchOrParseAfterUpdate) {
      await this.fetchOrParse();
      this.fetchOrParseAfterUpdate = false;
    }
  }

  @Watch('theme')
  async loadTheme() {
    if (this.terminal !== DeckdeckgoHighlightCodeTerminal.CARBON || !this.theme) {
      this.themeStyle = undefined;
      return;
    }

    const {theme} = await loadTheme(this.theme);
    this.themeStyle = theme;
  }

  @Listen('prismLanguageLoaded', {target: 'document'})
  async languageLoaded($event: CustomEvent) {
    if (!$event || !$event.detail) {
      return;
    }

    if (this.language && this.language !== 'javascript' && $event.detail === this.language) {
      await this.fetchOrParse();
    }
  }

  private async fetchOrParse() {
    if (this.src) {
      await this.fetchCode();
    } else {
      await this.parseSlottedCode();
    }
  }

  private languageDidLoad(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!document || !this.language || this.language === '') {
        resolve(false);
        return;
      }

      if (this.language === 'javascript') {
        resolve(true);
        return;
      }

      const scripts = document.querySelector("[deckdeckgo-prism-loaded='" + this.language + "']");
      if (scripts) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  }

  @Watch('language')
  async loadLanguages() {
    await this.loadLanguagesRequire();

    await this.loadScript(this.language);
  }

  private async loadLanguagesRequire() {
    const promises: Promise<void>[] = [];

    const definition = deckdeckgoHighlightCodeLanguages[this.language];
    if (definition.require) {
      if (Array.isArray(definition.require) && definition.require.length > 0) {
        promises.push(...definition.require.map((extraScript) => this.loadScript(extraScript)));
      } else if (typeof definition.require === 'string' && definition.require !== '') {
        promises.push(this.loadScript(definition.require));
      }
    }

    if (promises.length <= 0) {
      return;
    }

    await Promise.all(promises);
  }

  private loadScript(lang: string): Promise<void> {
    return new Promise<void>(async (resolve) => {
      if (!document || !lang || lang === '' || lang === 'javascript') {
        resolve();
        return;
      }

      const scripts = document.querySelector("[deckdeckgo-prism='" + lang + "']");
      if (scripts) {
        resolve();
        return;
      }

      const script = document.createElement('script');

      script.onload = async () => {
        script.setAttribute('deckdeckgo-prism-loaded', lang);
        this.prismLanguageLoaded.emit(lang);
      };

      script.onerror = async () => {
        if (script.parentElement) {
          script.parentElement.removeChild(script);
        }

        // if the language definition doesn't exist or if unpkg is down, display code anyway
        this.prismLanguageLoaded.emit(lang);
      };

      script.src = 'https://unpkg.com/prismjs@latest/components/prism-' + lang + '.js';
      script.setAttribute('deckdeckgo-prism', lang);
      script.defer = true;

      document.head.appendChild(script);

      resolve();
    });
  }

  @Watch('lineNumbers')
  async onLineNumbersChange() {
    await this.fetchOrParse();
  }

  @Watch('terminal')
  async onCarbonChange() {
    this.fetchOrParseAfterUpdate = true;

    await this.loadGoogleFonts();
  }

  private async loadGoogleFonts() {
    if (this.terminal === DeckdeckgoHighlightCodeTerminal.UBUNTU) {
      await injectCSS('google-fonts-ubuntu', 'https://fonts.googleapis.com/css?family=Ubuntu|Ubuntu+Mono&display=swap');
    }
  }

  @Method()
  load(): Promise<void> {
    return new Promise<void>(async (resolve) => {
      if (!this.language || this.language === '') {
        resolve();
        return;
      }

      if (this.language === 'javascript') {
        await this.fetchOrParse();
        resolve();
        return;
      }

      if (document.querySelector("[deckdeckgo-prism-loaded='" + this.language + "']")) {
        await this.fetchOrParse();
      } else {
        await this.loadLanguages();
      }

      resolve();
    });
  }

  private parseSlottedCode(): Promise<void> {
    const code: HTMLElement = this.el.querySelector("[slot='code']");

    if (code) {
      return this.parseCode(code.innerText ? code.innerText.trim() : code.innerText);
    } else {
      return new Promise<void>((resolve) => {
        resolve();
      });
    }
  }

  async fetchCode() {
    if (!this.src) {
      return;
    }

    let fetchedCode: string;
    try {
      const response: Response = await fetch(this.src);
      fetchedCode = await response.text();

      await this.parseCode(fetchedCode);
    } catch (e) {
      // Prism might not be able to parse the code for the selected language
      const container: HTMLElement = this.el.shadowRoot.querySelector('div.deckgo-highlight-code-container');

      if (container && fetchedCode) {
        container.children[0].innerHTML = fetchedCode;
      }
    }
  }

  private parseCode(code: string): Promise<void> {
    return new Promise<void>(async (resolve, reject) => {
      const container: HTMLElement = this.el.shadowRoot.querySelector('div.deckgo-highlight-code-container');

      if (!code || code === undefined || code === '') {
        resolve();
        return;
      }

      if (container) {
        try {
          // clear the container first
          container.children[0].innerHTML = '';

          // split the code on linebreaks
          const regEx = RegExp(/\n(?!$)/g); //
          const match = code.split(regEx);
          match.forEach((m, idx, array) => {
            // On last element
            if (idx === array.length - 1) {
              this.attachHighlightObserver(container);
            }

            let div: HTMLElement = document.createElement('div');
            if (this.lineNumbers) {
              div.classList.add('deckgo-highlight-code-line-number');
            }

            const highlight: string = Prism.highlight(m, Prism.languages[this.language], this.language);

            // If empty, use \u200B as zero width text spacer
            div.innerHTML = highlight && highlight !== '' ? highlight : '\u200B';

            container.children[0].appendChild(div);
          });

          await this.addAnchors();

          resolve();
        } catch (err) {
          reject(err);
        }
      }
    });
  }

  private attachHighlightObserver(container: HTMLElement) {
    if (window && 'ResizeObserver' in window) {
      // @ts-ignore
      const observer: ResizeObserver = new ResizeObserver(async (_entries) => {
        await this.addHighlight();

        observer.disconnect();
      });

      observer.observe(container);
    } else {
      // Back in my days...
      setTimeout(async () => {
        await this.addHighlight();
      }, 100);
    }
  }

  private addAnchors(): Promise<void> {
    return new Promise<void>((resolve) => {
      const elements: NodeListOf<HTMLElement> = this.el.shadowRoot.querySelectorAll('span.comment');

      if (elements) {
        const elementsArray: HTMLElement[] = Array.from(elements);

        const anchors: HTMLElement[] = elementsArray.filter((element: HTMLElement) => {
          return this.hasLineAnchor(element.innerHTML);
        });

        if (anchors) {
          anchors.forEach((anchor: HTMLElement) => {
            anchor.classList.add('deckgo-highlight-code-anchor');

            if (this.hideAnchor) {
              anchor.classList.add('deckgo-highlight-code-anchor-hidden');
            }
          });
        }
      }

      resolve();
    });
  }

  private hasLineAnchor(line: string): boolean {
    return line && this.anchor && line.indexOf('@Prop') === -1 && line.split(' ').join('').indexOf(this.anchor.split(' ').join('')) > -1;
  }

  private addHighlight(): Promise<void> {
    return new Promise<void>(async (resolve) => {
      if (this.highlightLines && this.highlightLines.length > 0) {
        const rows: number[] = await this.findRowsToHighlight();

        if (rows && rows.length > 0) {
          const containerCode: HTMLElement = this.el.shadowRoot.querySelector('code');

          if (containerCode && containerCode.hasChildNodes()) {
            const elements: HTMLElement[] = Array.prototype.slice.call(containerCode.childNodes);

            let rowIndex: number = 0;
            let lastOffsetTop: number = -1;
            let offsetHeight: number = -1;

            elements.forEach((element: HTMLElement) => {
              let editElement: HTMLElement;

              // We need to convert text entries to an element in order to be able to style it
              if (element.nodeName === '#text') {
                const span = document.createElement('span');

                if (element.previousElementSibling) {
                  element.previousElementSibling.insertAdjacentElement('afterend', span);
                } else {
                  element.parentNode.prepend(span);
                }

                span.appendChild(element);

                editElement = span;
              } else {
                editElement = element;
              }

              // We try to find the row index with the offset of the element
              rowIndex = editElement.offsetTop > lastOffsetTop ? rowIndex + 1 : rowIndex;
              lastOffsetTop = editElement.offsetTop;

              // For some reason, some converted text element are displayed on two lines, that's why we should consider the 2nd one as index
              offsetHeight = offsetHeight === -1 || offsetHeight > editElement.offsetHeight ? editElement.offsetHeight : offsetHeight;

              const rowsIndexToCompare: number = editElement.offsetHeight > offsetHeight ? rowIndex + 1 : rowIndex;

              if (rows.indexOf(rowsIndexToCompare) > -1) {
                editElement.classList.add('deckgo-highlight-code-line');
              }
            });
          }
        }
      }

      resolve();
    });
  }

  private findRowsToHighlight(): Promise<number[]> {
    return new Promise<number[]>((resolve) => {
      let results: number[] = [];

      const rows: string[] = this.highlightLines.split(' ');

      if (rows && rows.length > 0) {
        rows.forEach((row: string) => {
          const index: string[] = row.split(',');

          if (index && index.length >= 1) {
            const start: number = parseInt(index[0], 0);
            const end: number = parseInt(index[1], 0);

            for (let i = start; i <= end; i++) {
              results.push(i);
            }
          }
        });
      }

      resolve(results);
    });
  }

  @Method()
  findNextAnchor(enter: boolean): Promise<DeckdeckgoHighlightCodeAnchor> {
    return new Promise<DeckdeckgoHighlightCodeAnchor>(async (resolve) => {
      const elements: NodeListOf<HTMLElement> = this.el.shadowRoot.querySelectorAll('span.deckgo-highlight-code-anchor');

      if (elements) {
        const elementsArray: HTMLElement[] = enter ? Array.from(elements) : Array.from(elements).reverse();

        const anchor: HTMLElement = elementsArray.find((element: HTMLElement) => {
          return enter ? element.offsetTop > this.anchorOffsetTop : element.offsetTop < this.anchorOffsetTop;
        });

        if (anchor) {
          this.anchorOffsetTop = anchor.offsetTop;

          resolve({
            offsetTop: anchor.offsetTop,
            hasLineZoom: this.hasLineZoom(anchor.textContent),
          });
        } else if (!enter) {
          const elementCode: HTMLElement = this.el.shadowRoot.querySelector('code');

          if (elementCode && elementCode.firstElementChild) {
            this.anchorOffsetTop = 0;

            resolve({
              offsetTop: 0,
              hasLineZoom: false,
            });
          } else {
            resolve(null);
          }
        } else {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    });
  }

  @Method()
  zoomCode(zoom: boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      const container: HTMLElement = this.el.shadowRoot.querySelector('div.deckgo-highlight-code-container');

      if (container) {
        container.style.setProperty('--deckgo-highlight-code-zoom', zoom ? '1.3' : '1');
      }

      resolve();
    });
  }

  private hasLineZoom(line: string): boolean {
    return line && this.anchorZoom && line.indexOf('@Prop') === -1 && line.split(' ').join('').indexOf(this.anchorZoom.split(' ').join('')) > -1;
  }

  private edit(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.editable) {
        resolve();
        return;
      }

      this.editing = true;

      const slottedCode: HTMLElement = this.el.querySelector("[slot='code']");

      if (slottedCode) {
        setTimeout(() => {
          slottedCode.setAttribute('contentEditable', 'true');
          slottedCode.addEventListener('blur', this.applyCode, {once: true});
          slottedCode.addEventListener('keydown', this.catchNewLine);

          slottedCode.focus();
        }, 100);
      }

      resolve();
    });
  }

  private catchNewLine = async ($event: KeyboardEvent) => {
    if ($event && $event.key === 'Enter') {
      $event.preventDefault();

      const selection: Selection = await this.getSelection();
      if (selection && selection.focusNode && selection.focusNode.textContent && selection.focusOffset > 0) {
        const charCode: number = selection.focusNode.textContent.charCodeAt(window.getSelection().focusOffset);

        document.execCommand('insertHTML', false, charCode === 10 || charCode === 13 ? '\n' : '\n\n');
      } else {
        document.execCommand('insertHTML', false, '\n\n');
      }
    }
  };

  private getSelection(): Promise<Selection> {
    return new Promise<Selection>((resolve) => {
      let selectedSelection: Selection = null;

      if (window && window.getSelection) {
        selectedSelection = window.getSelection();
      } else if (document && document.getSelection) {
        selectedSelection = document.getSelection();
      } else if (document && (document as any).selection) {
        selectedSelection = (document as any).selection.createRange().text;
      }

      resolve(selectedSelection);
    });
  }

  private applyCode = async () => {
    await this.stopEditing();

    await this.parseSlottedCode();
  };

  private stopEditing(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.editing = false;

      const slottedCode: HTMLElement = this.el.querySelector("[slot='code']");

      if (slottedCode) {
        slottedCode.removeAttribute('contentEditable');

        if (slottedCode.innerHTML) {
          slottedCode.innerHTML = slottedCode.innerHTML.trim();
        }

        this.codeDidChange.emit(this.el);
      }

      resolve();
    });
  }

  render() {
    const hostClass = {
      'deckgo-highlight-code-edit': this.editing,
      'deckgo-highlight-code-carbon': this.terminal === DeckdeckgoHighlightCodeTerminal.CARBON,
      'deckgo-highlight-code-ubuntu': this.terminal === DeckdeckgoHighlightCodeTerminal.UBUNTU,
    };

    if (this.terminal === DeckdeckgoHighlightCodeTerminal.CARBON) {
      hostClass[`deckgo-highlight-code-theme-${this.theme}`] = true;
    }

    return (
      <Host class={hostClass}>
        {this.renderCarbon()}
        {this.renderUbuntu()}
        <div class="deckgo-highlight-code-container" onMouseDown={() => this.edit()} onTouchStart={() => this.edit()}>
          <code></code>
          <slot name="code"></slot>
        </div>
      </Host>
    );
  }

  private renderCarbon() {
    if (this.terminal !== DeckdeckgoHighlightCodeTerminal.CARBON) {
      return undefined;
    }

    return [
      <CarbonThemeStyle style={this.themeStyle} />,
      <div class="carbon">
        {this.renderCarbonCircle('red')}
        {this.renderCarbonCircle('yellow')}
        {this.renderCarbonCircle('green')}
      </div>,
    ];
  }

  private renderCarbonCircle(color: 'red' | 'yellow' | 'green') {
    return <div class={color}></div>;
  }

  private renderUbuntu() {
    if (this.terminal !== DeckdeckgoHighlightCodeTerminal.UBUNTU) {
      return undefined;
    }

    return (
      <div class="ubuntu">
        {this.renderUbuntuCircle('close')}
        {this.renderUbuntuCircle('minimize')}
        {this.renderUbuntuCircle('maximize')}
        <p>
          <slot name="user"></slot>
        </p>
      </div>
    );
  }

  private renderUbuntuCircle(mode: 'close' | 'minimize' | 'maximize') {
    const symbol: string = mode === 'close' ? '&#10005;' : mode === 'minimize' ? '&#9472;' : '&#9723;';

    return <div class={mode} innerHTML={symbol}></div>;
  }
}
