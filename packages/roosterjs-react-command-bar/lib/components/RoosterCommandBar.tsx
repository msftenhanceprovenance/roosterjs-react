import * as React from 'react';
import { Async, css } from 'office-ui-fabric-react/lib/Utilities';
import { CommandBar } from 'office-ui-fabric-react/lib/CommandBar';
import { IContextualMenuItem } from 'office-ui-fabric-react/lib/ContextualMenu';
import { createFormatState } from 'roosterjs-react-editor';
import { Editor } from 'roosterjs-editor-core';
import { ChangeSource, FormatState } from 'roosterjs-editor-types';
import { getFormatState } from 'roosterjs-editor-api';
import { OutOfBoxCommandBarItems, OutOfBoxCommandBarItemMap, OutOfBoxCommandBarItem } from '../utils/OutOfBoxCommandBarItem';
import { RoosterCommandBarProps, RoosterCommandBarState } from '../schema/RoosterCommandBarSchema';
import { insertImage } from 'roosterjs-editor-api';

import './RoosterCommandBar.scss.g';

const DisplayNoneStyle = { display: "none" } as React.CSSProperties;

export default class RoosterCommandBar extends React.PureComponent<RoosterCommandBarProps, RoosterCommandBarState> {
    private _async: Async;
    private _updateFormatStateDebounced: () => void;
    private _fileInput: HTMLInputElement;
    private _buttonKeys: string[];

    constructor(props: RoosterCommandBarProps) {
        super(props);

        this.state = { formatState: createFormatState() };
        this._initButtonKeys(props);

        this._async = new Async();
        this._updateFormatStateDebounced = this._async.debounce(() => this._updateFormatState(), 100);
    }

    public render(): JSX.Element {
        const { className } = this.props;

        // with the newest changes on the editor, create the latest items (e.g. bold item being selected if text selected is bold)
        const items = this._createItems();
        return (
            <div className={css("rooster-command-bar", className)}>
                <CommandBar className={"command-bar"} items={items} />
                <input
                    type="file"
                    ref={this._fileInputOnRef}
                    accept="image/*"
                    style={DisplayNoneStyle}
                    onChange={this._fileInputOnChange}
                />
            </div>
        );
    }

    public componentDidMount(): void {
        const { roosterCommandBarPlugin } = this.props;

        roosterCommandBarPlugin.registerRoosterCommandBar(this);
    }

    public componentWillUnmount(): void {
        const { roosterCommandBarPlugin } = this.props;

        roosterCommandBarPlugin.unregisterRoosterCommandBar(this);

        if (this._async) {
            this._async.dispose();
            this._async = null;
        }
    }

    public componentWillUpdate(nextProps: RoosterCommandBarProps, nextState: RoosterCommandBarState) {
        this._initButtonKeys(nextProps);
    }

    public refreshFormatState(): void {
        this._updateFormatStateDebounced();
    }

    private _initButtonKeys(props: RoosterCommandBarProps): void {
        this._buttonKeys = props.visibleButtonKeys || OutOfBoxCommandBarItems.map(item => item.key);
    }

    private _createItems(): IContextualMenuItem[] {
        return this._buttonKeys.map(key => this._getMenuItem(OutOfBoxCommandBarItemMap[key])).filter(menuItem => !!menuItem);
    }

    private _fileInputOnRef = (ref: HTMLInputElement): void => {
        this._fileInput = ref;
    };

    private _fileInputOnChange = (): void => {
        const { roosterCommandBarPlugin, imageManager } = this.props;

        const editor: Editor = roosterCommandBarPlugin.getEditor();
        const file = this._fileInput.files[0];
        if (editor && !editor.isDisposed() && file) {
            if (imageManager) {
                const placeholder = imageManager.upload(editor, file);
                editor.insertNode(placeholder);
                editor.triggerContentChangedEvent(ChangeSource.Format);
                editor.addUndoSnapshot();
            } else {
                insertImage(editor, file);
            }
            this._fileInput.value = "";
        }
    };

    private _getMenuItem = (commandBarItem: OutOfBoxCommandBarItem): IContextualMenuItem => {
        if (!commandBarItem) {
            return null;
        }

        const { strings, calloutClassName, calloutOnDismiss } = this.props;
        const { formatState } = this.state;
        const item = { ...commandBarItem }; // make a copy of the OOB item template

        if (item.getChecked) {
            item.checked = item.getChecked(formatState);
        }
        if (item.getSelected) {
            item.className = css({ "is-selected": item.getSelected(formatState) });
        }
        if (item.getDisabled) {
            item.disabled = item.getDisabled(formatState);
        }
        item.onClick = this._onCommandBarItemClick.bind(this, item);
        item.iconOnly = true;
        if (strings && strings[item.key]) {
            item.name = strings[item.key];
        }
        if (item.name && item.title == null) {
            item.title = item.name;
        }
        if (item.subMenuProps && item.subMenuProps.items) {
            item.subMenuProps = { ...item.subMenuProps };
            item.subMenuProps.items = item.subMenuProps.items.map(this._getMenuItem);
            item.subMenuProps.calloutProps = { className: calloutClassName };
            item.subMenuProps.onDismiss = calloutOnDismiss;
        }

        return item;
    };

    private _onCommandBarItemClick = (item: OutOfBoxCommandBarItem | IContextualMenuItem) => {
        const { roosterCommandBarPlugin } = this.props;

        const editor: Editor = roosterCommandBarPlugin.getEditor();
        if (editor && item.handleChange) {
            const outOfBoxItem: OutOfBoxCommandBarItem = item;
            outOfBoxItem.handleChange(editor, this.props, this.state);
        }

        // special case photo
        if (item.key === "photo") {
            this._fileInput.click();
        }

        this._updateFormatState();
    };

    private _updateFormatState = (): void => {
        const { roosterCommandBarPlugin } = this.props;

        const editor: Editor = roosterCommandBarPlugin.getEditor();
        const formatState = editor ? getFormatState(editor) : null;
        if (formatState && this._isFormatStateChanged(formatState)) {
            this.setState({ formatState });
        }
    };

    private _isFormatStateChanged(newState: FormatState): boolean {
        const { formatState } = this.state;

        for (const key in formatState) {
            if (formatState[key] !== newState[key]) {
                return true;
            }
        }

        return false;
    }
}