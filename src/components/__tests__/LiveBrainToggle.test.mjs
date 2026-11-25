import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = readFileSync(new URL('../SettingsOverlay.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('SettingsOverlay.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function findToggleHandler(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'SettingsToggle') {
        const attributes = node.attributes.properties;
        const label = attributes.find((attribute) => attribute.name?.getText(ast) === 'label');
        if (label?.initializer.getText(ast) === "{t('Live Brain')}") {
            return attributes.find((attribute) => attribute.name?.getText(ast) === 'onChange').initializer.expression;
        }
    }
    return ts.forEachChild(node, findToggleHandler);
}

test('the Live Brain SettingsToggle optimistically changes and rolls back on failure', async () => {
    const handlerSource = findToggleHandler(ast).getText(ast);
    for (const initiallyEnabled of [true, false]) {
        for (const reject of [true, false]) {
            const values = [];
            const messages = [];
            const pending = [];
            let finish;
            const invoke = new Promise((resolve, rejectRequest) => {
                finish = reject ? rejectRequest : resolve;
            });
            const onChange = runInNewContext(handlerSource, {
                liveBrainEnabled: initiallyEnabled,
                setLiveBrainEnabled: (value) => values.push(value),
                setLiveBrainError: (value) => messages.push(value),
                setLiveBrainPending: (value) => pending.push(value),
                window: { electronAPI: { setLiveBrainEnabled: (value) => {
                    assert.equal(value, !initiallyEnabled);
                    return invoke;
                } } },
            });
            const completed = onChange();
            assert.deepEqual(values, [!initiallyEnabled]);
            finish({ success: false, message: 'Test failure' });
            await completed;
            assert.deepEqual(values, [!initiallyEnabled, initiallyEnabled]);
            assert.deepEqual(pending, [true, false]);
            assert.deepEqual(messages, ['', reject ? 'Could not update Live Brain.' : 'Test failure']);
        }
    }
});
