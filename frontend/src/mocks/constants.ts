const uuid = (value: number) => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')

export const P1A_IDS = {
  term: '00000000-0000-4000-8000-000000000011',
  baseWeb: uuid(101), baseDatabase: uuid(102),
  baseConflict: uuid(103), baseForbidden: uuid(104),
  offeringWeb: uuid(201), offeringDatabase: uuid(202), offeringEmpty: uuid(203), offeringPendingArchive: uuid(204),
  offeringForeign: uuid(299), offeringPersonal: uuid(210),
  basePersonal: uuid(110),
  // V16 迁移对齐：5 章真实 Web 课程
  chapterPersonal1: uuid(310), chapterPersonal2: uuid(311), chapterPersonal3: uuid(312),
  chapterPersonal4: uuid(313), chapterPersonal5: uuid(314),
  // V16 迁移对齐：10 份资源
  resourcePersonal1: uuid(410), resourcePersonal2: uuid(411), resourcePersonal3: uuid(412),
  resourcePersonal4: uuid(413), resourcePersonal5: uuid(414),
  resourcePersonal6: uuid(415), resourcePersonal7: uuid(416),
  resourcePersonal8: uuid(417), resourcePersonal9: uuid(418),
  resourcePersonal10: uuid(419),
  // V16 迁移对齐：12 个知识点
  knowledgePersonal1: uuid(510), knowledgePersonal2: uuid(511), knowledgePersonal3: uuid(512),
  knowledgePersonal4: uuid(513), knowledgePersonal5: uuid(514), knowledgePersonal6: uuid(515),
  knowledgePersonal7: uuid(516), knowledgePersonal8: uuid(517), knowledgePersonal9: uuid(518),
  knowledgePersonal10: uuid(519), knowledgePersonal11: uuid(520), knowledgePersonal12: uuid(521),
  // 旧字段保留（兼容）
  chapterWeb: uuid(301), chapterSecond: uuid(302),
  chapterDraft: uuid(303), chapterDatabase: uuid(304), chapterArchived: uuid(305),
  resourceWeb: uuid(401), resourceSecond: uuid(402), resourceDatabase: uuid(403),
  knowledgeWeb: uuid(501), knowledgeDatabase: uuid(502),
  inviteDatabase: uuid(601), inviteEmpty: uuid(602),
} as const

export const P1A_INVITE_CODES = {
  database: 'P1A-DB-DEMO-2026', empty: 'P1A-EMPTY-DEMO-2026',
  expired: 'P1A-EXPIRED-DEMO-2026', revoked: 'P1A-REVOKED-DEMO-2026',
  exhausted: 'P1A-EXHAUSTED-DEMO-2026',
} as const
