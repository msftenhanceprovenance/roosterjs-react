import * as React from 'react';
import { css, NullFunction } from 'roosterjs-react-common';
import { Editor, EditorOptions, EditorPlugin, Undo, UndoService } from 'roosterjs-editor-core';
import { ContentEdit, DefaultShortcut, HyperLink, Paste } from 'roosterjs-editor-plugins';
import { DefaultFormat } from 'roosterjs-editor-types';
import EditorViewState from '../schema/EditorViewState';
import './LeanRooster.scss.g';

const ContentEditableDivStyle = { userSelect: "text", msUserSelect: "text", WebkitUserSelect: "text" } as React.CSSProperties;

export const enum LeanRoosterModes {
    View = 0,
    Edit = 1
}

export interface LeanRoosterProps {
    activateRoosterOnMount?: boolean;
    className?: string,
    contentDivRef?: (ref: HTMLDivElement) => void;
    defaultFormat?: DefaultFormat;
    disableRestoreSelectionOnFocus?: boolean;
    hyperlinkToolTipCallback?: (href: string) => string;
    isRtl?: boolean;
    onAfterModeChange?: (newMode: LeanRoosterModes) => void;
    onBeforeModeChange?: (newMode: LeanRoosterModes) => boolean;
    onBlur?: (ev: React.FocusEvent<HTMLDivElement>) => void;
    onFocus?: (ev: React.FocusEvent<HTMLDivElement>) => void;
    plugins?: EditorPlugin[],
    readonly?: boolean;
    undo?: UndoService;
    updateViewState?: (viewState: EditorViewState, content: string, isInitializing: boolean) => void;
    viewState: EditorViewState;
}

export default class LeanRooster extends React.Component<LeanRoosterProps, {}> {
    private _contentDiv: HTMLDivElement;
    private _editor: Editor;
    private _mode: LeanRoosterModes = LeanRoosterModes.View;
    // Note: set React DIV up with an intial inner HTML, but don't change it after creating rooster editor, otherwise
    // React will recreate the elements defined by the inner HTML
    private _initialContent: { __html: string } = undefined;
    private _editorOptions: EditorOptions = null;

    constructor(props: LeanRoosterProps) {
        super(props);

        this._setInitialReactContent();
        this._editorOptions = this._createEditorOptions();
    }

    public render(): JSX.Element {
        const { className, isRtl, readonly } = this.props;

        return <div
            className={css(
                "lean-rooster",
                className,
                this.mode === LeanRoosterModes.View ? "view-mode" : "edit-mode",
                readonly ? "readonly" : undefined)}
            contentEditable={!readonly}
            dir={isRtl ? "rtl" : "ltr"}
            onBlur={this._onBlur}
            onFocus={this._onFocus}
            onMouseDown={this._onMouseDown}
            onMouseUp={this._onMouseUp}
            ref={this._contentDivOnRef}
            style={ContentEditableDivStyle}
            suppressContentEditableWarning={true}
            tabIndex={0}
            dangerouslySetInnerHTML={this._initialContent} />;
    }

    public componentDidMount(): void {
        const { readonly, activateRoosterOnMount } = this.props;

        if (!readonly && activateRoosterOnMount) {
            this._trySwithToEditMode();
        }
    }

    public componentWillUnmount(): void {
        this._updateContentToViewState();
        if (this._editor) {
            this._editor.dispose();
            this._editor = null;
        }
    }

    public shouldComponentUpdate(): boolean {
        return false;
    }

    public get mode(): LeanRoosterModes {
        return this._mode;
    }

    public set mode(value: LeanRoosterModes) {
        if (value === LeanRoosterModes.Edit) {
            this._trySwithToEditMode();
        }
        else {
            this._trySwitchToViewMode();
        }
    }

    public focus(): void {
        if (this._editor) {
            this._editor.focus();
        }
    }

    public reloadContent(): void {
        const { viewState } = this.props;

        if (this._editor) {
            this._editor.setContent(viewState.content);
            this._editorOptions.undo.clear();
            this._editor.addUndoSnapshot();
        } else {
            this._setInitialReactContent();
            this.forceUpdate();
        }
    }

    public selectAll(): void {
        const contentDiv = this._contentDiv;
        if (!contentDiv) {
            return;
        }

        if (this._editor && !this._editor.isDisposed()) {
            const range = this._editor.getDocument().createRange();
            range.selectNodeContents(contentDiv);
            this._editor.updateSelection(range);
        } else {
            const range = contentDiv.ownerDocument.createRange();
            range.selectNodeContents(contentDiv);
            const selection = window.getSelection();

            // Workaround IE exception 800a025e
            try {
                selection.removeAllRanges();
            } catch (e) { }

            selection.addRange(range);
        }
    }

    private _setInitialReactContent(): void {
        const { viewState } = this.props;
        const hasContent = viewState.content != null && viewState.content.length > 0;
        this._initialContent = hasContent ? { __html: viewState.content } : undefined;
    }

    private _updateContentToViewState(isInitializing?: boolean): void {
        if (this._editor) {
            const { updateViewState = this._updateViewState, viewState } = this.props;
            updateViewState(viewState, this._editor.getContent(), isInitializing);
        }
    }

    private _createEditorOptions(): EditorOptions {
        const { plugins: additionalPlugins = [], undo = new Undo(), hyperlinkToolTipCallback, defaultFormat } = this.props;

        const plugins: EditorPlugin[] = [
            new ContentEdit(),
            new HyperLink(hyperlinkToolTipCallback),
            new Paste(true /*useDirectPaste*/),
            new DefaultShortcut(),
            ...additionalPlugins
        ];

        // Important: don't set the initial content, the content editable already starts with initial HTML content
        return { plugins, defaultFormat, undo, omitContentEditableAttributeChanges: true /* avoid unnecessary reflow */ };
    }

    private _updateViewState = (viewState: EditorViewState, content: string, isInitializing: boolean): void => {
        if (viewState.content !== content) {
            viewState.content = content;
            if (!isInitializing) {
                const originalContent = this._initialContent ? this._initialContent.__html : null;
                viewState.isDirty = content !== originalContent;
            }
        }
    };

    private _trySwithToEditMode(): boolean {
        const { readonly, onBeforeModeChange = NullFunction, onAfterModeChange = NullFunction } = this.props;

        if (this.mode === LeanRoosterModes.Edit || readonly) {
            return false;
        }
        if (onBeforeModeChange(LeanRoosterModes.Edit)) {
            return;
        }
        const isInitializing = !this._editor;
        if (isInitializing) {
            this._editor = new Editor(this._contentDiv, this._editorOptions);
        }
        this._mode = LeanRoosterModes.Edit;

        this._updateContentToViewState(isInitializing);
        this.forceUpdate();
        onAfterModeChange(LeanRoosterModes.Edit);

        return true;
    }

    private _trySwitchToViewMode(): boolean {
        const { onBeforeModeChange = NullFunction, onAfterModeChange = NullFunction } = this.props;

        if (this.mode === LeanRoosterModes.View) {
            return false;
        }
        if (onBeforeModeChange(LeanRoosterModes.View)) {
            return false;
        }

        this._updateContentToViewState();
        this._mode = LeanRoosterModes.View;
        this.forceUpdate();
        onAfterModeChange(LeanRoosterModes.View);

        return true;
    }

    private _onMouseDown = (ev: React.MouseEvent<HTMLDivElement>): void => {
        this._trySwithToEditMode();
    };

    private _onMouseUp = (ev: React.MouseEvent<HTMLDivElement>): void => {
        if (this._editor && !this._editor.hasFocus()) {
            this._editor.focus();
        }
    };

    private _onBlur = (ev: React.FocusEvent<HTMLDivElement>): void => {
        const { onBlur = NullFunction } = this.props;

        this._updateContentToViewState();
        onBlur(ev);
    };

    private _onFocus = (ev: React.FocusEvent<HTMLDivElement>): void => {
        const { onFocus = NullFunction } = this.props;

        if (this._trySwithToEditMode()) {
            this._editor.focus();
        }
        onFocus(ev);
    };

    private _contentDivOnRef = (ref: HTMLDivElement): void => {
        const { contentDivRef = NullFunction } = this.props;

        this._contentDiv = ref;
        contentDivRef(ref);
    };
}