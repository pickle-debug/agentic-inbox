import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const dir = await mkdtemp(join(tmpdir(), 'contact-recipients-'));
try {
	const file = join(dir, 'recipients.mjs');
	await build({ entryPoints: ['app/lib/contact-recipients.ts'], outfile: file, bundle: true, format: 'esm', platform: 'node' });
	const { recipientToken, insertContactRecipient } = await import(pathToFileURL(file));
	assert.equal(recipientToken('first@example.com, 张三').query, '张三');
	assert.equal(recipientToken('张三, last@example.com', 1).query, '张三');
	assert.deepEqual(insertContactRecipient('', 'person@example.com'), { value: 'person@example.com, ', caret: 20 });
	assert.equal(insertContactRecipient('first@example.com, 张三', 'person@example.com').value, 'first@example.com, person@example.com, ');
	assert.equal(insertContactRecipient('张三, last@example.com', 'person@example.com', 1).value, 'person@example.com, last@example.com');
	assert.equal(insertContactRecipient('first@example.com, 张三, last@example.com', 'person@example.com', 20).value, 'first@example.com, person@example.com, last@example.com');
	assert.equal(insertContactRecipient('PERSON@example.com, 张三', 'person@example.com').value, 'PERSON@example.com, ');
	assert.equal(insertContactRecipient('张三, PERSON@example.com', 'person@example.com', 1).value, 'PERSON@example.com');
	assert.equal(insertContactRecipient('person@example.com', 'person@example.com').value, 'person@example.com, ');
	assert.equal(recipientToken('first@example.com, ').query, '');
	assert.equal(insertContactRecipient(', last@example.com', 'person@example.com', 0).value, 'person@example.com, last@example.com');
	console.log('PASS: contact selection preserves multiple recipients, edits at the caret, normalizes separators and prevents duplicates.');
} finally {
	await rm(dir, { recursive: true, force: true });
}
