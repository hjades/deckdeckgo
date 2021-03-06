import {Component, h, Element, Prop, Event, EventEmitter} from '@stencil/core';

import {popoverController} from '@ionic/core';

@Component({
  tag: 'app-action-help',
})
export class AppActionHelp {
  @Element() el: HTMLElement;

  @Prop()
  link: boolean = false;

  @Event()
  private helpSelected: EventEmitter<void>;

  private async openGetHelp($event?: UIEvent) {
    this.helpSelected.emit();

    const popover: HTMLIonPopoverElement = await popoverController.create({
      component: 'app-get-help',
      mode: 'ios',
      event: $event,
      cssClass: 'info',
    });

    await popover.present();
  }

  render() {
    if (this.link) {
      return (
        <a onClick={() => this.openGetHelp()} aria-label="Help">
          <p>Help</p>
        </a>
      );
    } else {
      return (
        <button aria-label="Help" onClick={($event: UIEvent) => this.openGetHelp($event)} class="get-help-action ion-activatable">
          <ion-ripple-effect></ion-ripple-effect>
          <ion-icon aria-hidden="true" src="/assets/icons/ionicons/help.svg"></ion-icon>
          <ion-label aria-hidden="true">Help</ion-label>
        </button>
      );
    }
  }
}
