'use client';

import { Guard } from '@/components/Guard';
import { OneRmBoard } from '@/components/OneRmBoard';

export default function OneRmPage() {
  return <Guard need="member">{(me) => <OneRmBoard me={me} />}</Guard>;
}
