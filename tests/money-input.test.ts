import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMoneyInput, parseMoneyInput } from '../src/utils/moneyInput';
import { formatFollowers } from '../src/utils/formatters';

test('formatMoneyInput và parseMoneyInput hoạt động chuẩn xác', () => {
  assert.equal(formatMoneyInput(20000000), '20.000.000');
  assert.equal(formatMoneyInput(''), '');
  assert.equal(formatMoneyInput(0), '0');

  assert.equal(parseMoneyInput('20.000.000'), 20000000);
  assert.equal(parseMoneyInput(''), '');
  assert.equal(parseMoneyInput('abc'), '');

  assert.equal(parseMoneyInput(formatMoneyInput(50000000)), 50000000);
});

test('formatFollowers hiển thị số đầy đủ có dấu chấm, bỏ K/M', () => {
  assert.equal(formatFollowers(377000), '377.000');
  assert.equal(formatFollowers(1413921), '1.413.921');
  assert.equal(formatFollowers(0), '0');
  assert.equal(formatFollowers(null), '0');
  assert.equal(formatFollowers(undefined), '0');
});
