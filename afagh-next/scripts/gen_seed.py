#!/usr/bin/env python3
# Generates seed SQL for the Afagh load-test staging DB.
# Column names are camelCase + double-quoted (drizzle keeps them quoted).
OUT = r"C:\Users\DiaKo System\AppData\Local\Temp\seed.sql"
N = 10000; SESSIONS = 100; SPERS = 100
assert SESSIONS * SPERS == N
PW = "a873f3e68a21e89a0a63c26967ed871c:cfa2238cba56085b77cb355799fda066a9f68490f921764d4e5b87676bc85e6f"

U=1_000_000; S=1_100_000; STF=1_200_000; STFU=1_000_000+10000
CRS=1_300_000; OFF_E=1_400_000; OFF_X=1_400_020
TERM=1_500_000; FTERM=1_500_001
EXS=1_600_000; HALL=1_700_000; EN=1_800_000; SEAT=1_900_000
INV=2_000_000; MIN=2_100_000; CES=2_200_000; PKT=2_300_000
INVIG_STAFF=STF+0; VAULT_STAFF=STF+1; INST_STAFF=STF+2
INVIG_USER=STFU+0; VAULT_USER=STFU+1; INST_USER=STFU+2

out=[]
def w(s): out.append(s)
def chunked(rows,n=1000):
    for i in range(0,len(rows),n): yield rows[i:i+n]
def ins(table,cols,rows,n=1000):
    if not rows: return
    qc=', '.join(f'"{c}"' for c in cols)
    for ch in chunked(rows,n):
        vals=", ".join("("+", ".join(str(x) for x in r)+")" for r in ch)
        w(f"INSERT INTO {table} ({qc}) VALUES\n{vals};")

w("-- lookup rows")
w(f'INSERT INTO degree_level_configs ("id","title","code","defaultPassingGrade","conditionalGpaThreshold") VALUES (900,\'LOADTEST\',\'LT900\',10,12) ON CONFLICT ("id") DO NOTHING;')
w(f'INSERT INTO educational_regulations ("id","title","degreeLevelId","effectiveFromYear","rulesConfig") VALUES (900,\'LOADTEST\',900,1400,\'{{}}\') ON CONFLICT ("id") DO NOTHING;')

w("-- staff + users")
ins("users",["id","nationalCode","firstName","lastName","passwordHash","isActive","universityId"],
    [(INVIG_USER,"9000000001","'LT'","'INVIG'",f"'{PW}'",1,1),
     (VAULT_USER,"9000000002","'LT'","'VAULT'",f"'{PW}'",1,1),
     (INST_USER, "9000000003","'LT'","'INST'", f"'{PW}'",1,1)])
ins("staff",["id","userId","staffCode","staffType","universityId"],
    [(INVIG_STAFF,INVIG_USER,"'LTINVIG'","'ADMIN'",1),
     (VAULT_STAFF,VAULT_USER,"'LTVAULT'","'ADMIN'",1),
     (INST_STAFF, INST_USER, "'LTINST'", "'ADMIN'",1)])

w("-- terms")
w(f'INSERT INTO academic_terms ("id","universityId","termCode","title","isCurrent","isEnrollmentOpen") VALUES ({TERM},1,\'14051\',\'LOAD TERM\',1,1);')
# isActive=0: engine's financial gate falls back to academic_terms.id for the
# clearance lookup (financial_clearances.termId FK -> academic_terms, NOT financial_terms).
# Keeping an ACTIVE financial_terms would set clearanceTermId = financial_terms.id, which
# can never match the FK-constrained financial_clearances.termId -> guaranteed gate failure.
w(f'INSERT INTO financial_terms ("id","universityId","termCode","title","startDate","endDate","isActive") VALUES ({FTERM},1,\'14051\',\'LOAD FIN\',\'2025-01-01\',\'2025-06-01\',0);')

w("-- enrollment-test courses + offerings")
ins("courses",["id","code","title","units","universityId"],
    [(CRS+k, f"'LT{k:03d}'", f"'LOAD COURSE {k}'", 3, 1) for k in range(20)])
# capacity 4000: 10,000 students x 6 courses = 60,000 cart lines, evenly spread
# across the 20 enrollment offerings => ~3,000 demand per offering. 4000 headroom
# guarantees all register (no waitlist) while still exercising the atomic seat guard.
ins("course_offerings",["id","termId","courseId","capacity","waitlistCapacity","enrolledCount","offeringType","isActive","universityId"],
    [(OFF_E+k, TERM, CRS+k, 4000, 0, 0, "'NORMAL'", 1, 1) for k in range(20)])

w("-- exam courses + offerings")
ins("courses",["id","code","title","units","universityId"],
    [(CRS+100+s, f"'EX{s:03d}'", f"'EXAM COURSE {s}'", 3, 1) for s in range(SESSIONS)])
ins("course_offerings",["id","termId","courseId","professorId","capacity","waitlistCapacity","enrolledCount","offeringType","isActive","universityId"],
    [(OFF_X+s, TERM, CRS+100+s, INST_STAFF, SPERS, 0, 0, "'NORMAL'", 1, 1) for s in range(SESSIONS)])

w("-- 10,000 students + users + clearances + cart items")
user_rows=[]; student_rows=[]; clear_rows=[]; cart_rows=[]
for i in range(N):
    uid=U+i; sid=S+i; nc=f"{1000000000+i:010d}"
    user_rows.append((uid, f"'{nc}'", "'LT'","'S'", f"'{PW}'",1,1))
    student_rows.append((sid, uid, f"{i:014d}", 900, 900, 1400, "'ACTIVE'", 1))
    # financial_clearances.termId must reference academic_terms (FK), so use TERM.
    clear_rows.append((sid, TERM, 1, 1))
    # Mixed concurrent scenario (per latest instruction): a compliant subgroup and a
    # non-compliant subgroup, both submitted simultaneously at 10k scale.
    #  - 70% of students: 6 courses (18 units) -> under the 20-unit cap -> AUTO-REGISTER
    #  - 30% of students: 10 courses (30 units) -> exceeds the unit cap -> REJECTED
    #    with a hard error (proves rule enforcement holds under load).
    if (i % 10) < 7:
        cnt, step = 6, 6
    else:
        cnt, step = 10, 10
    for k in range(cnt):
        cart_rows.append((sid, OFF_E+((i*step+k) % 20), 1))
ins("users",["id","nationalCode","firstName","lastName","passwordHash","isActive","universityId"], user_rows)
ins("students",["id","userId","studentCode","degreeLevelId","regulationId","entryYear","status","universityId"], student_rows)
ins("financial_clearances",["studentId","termId","isCleared","universityId"], clear_rows)
ins("cart_items",["studentId","offeringId","universityId"], cart_rows)

w("-- exam sessions topology")
hall_rows=[]; inv_rows=[]; min_rows=[]; ces_rows=[]; pkt_rows=[]; exs_rows=[]
for s in range(SESSIONS):
    sess=EXS+s; hall=HALL+s; off=OFF_X+s; crs=CRS+100+s
    month=(s//30)+1; day=(s%30)+1
    exs_rows.append((sess, TERM, f"'1405-{month:02d}-{day:02d}'", "'08:00'","'10:00'", 1))
    hall_rows.append((hall, f"'HALL {s}'", 200, 1))
    inv_rows.append((INV+s, sess, INVIG_STAFF, 1))
    min_rows.append((MIN+s, sess, hall, 100, 0, 1))
    ces_rows.append((CES+s, off, 1, 100, 1, 1))
    pkt_rows.append((PKT+s, sess, crs, 100, "'NOT_STARTED'", 1))
ins("exam_sessions",["id","termId","examDate","startTime","endTime","universityId"], exs_rows)
ins("exam_halls",["id","name","totalCapacity","universityId"], hall_rows)
ins("exam_invigilators",["id","examId","staffId","universityId"], inv_rows)
ins("exam_minutes",["id","sessionId","hallId","totalStudentsExpected","isSignedAndFinalized","universityId"], min_rows)
ins("course_exam_sessions",["id","courseOfferingId","totalHallsCount","totalExpectedSheets","isFullyCollected","universityId"], ces_rows)
ins("exam_course_packets",["id","examId","courseId","expectedSheetCount","handoverStatus","universityId"], pkt_rows)

w("-- 10,000 exam enrollments + seat allocations")
en_rows=[]; seat_rows=[]
for s in range(SESSIONS):
    sess=EXS+s; hall=HALL+s; off=OFF_X+s
    for k in range(SPERS):
        e=s*SPERS+k; sid=S+e
        en_rows.append((EN+e, sid, off, "'REGISTERED'", 1))
        seat_rows.append((SEAT+e, EN+e, sess, hall, k+1, 1))
ins("enrollments",["id","studentId","offeringId","status","universityId"], en_rows)
ins("seat_allocations",["id","enrollmentId","sessionId","hallId","seatNumber","universityId"], seat_rows)

w("-- reset sequences")
for t in ["users","students","staff","courses","course_offerings","academic_terms","financial_terms",
          "exam_sessions","exam_halls","enrollments","seat_allocations","exam_invigilators",
          "exam_minutes","course_exam_sessions","exam_course_packets"]:
    w(f'SELECT setval(pg_get_serial_sequence(\'{t}\',\'id\'), (SELECT COALESCE(max("id"),1) FROM "{t}")+1, false);')

with open(OUT,"w",encoding="utf-8") as f: f.write("\n".join(out))
print("wrote", OUT, "segments:", len(out))
