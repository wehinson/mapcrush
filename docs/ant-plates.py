# -*- coding: utf-8 -*-
"""Lateral specimen-plate illustrations for the ant power rankings.

One drawing engine, 50 parameter sets. Every ant is built from the same
anatomy (head, mandibles, elbowed antenna, mesosoma, petiolar node(s),
gaster, three leg pairs) so the plates read as one series, and the values
that differ are the ones that actually differ in the animal: head size,
mandible mechanism, eye size (0 = blind), waist nodes, gaster form,
spines, sting vs acidopore, leg length.

The feature each ant is famous for is drawn in the accent class so the
plate points at the weapon rather than just decorating the entry.
"""
import math

BASE = 27.0          # body axis
GF = 66.0            # gaster front edge


def _p(pts):
    return " ".join("%.1f,%.1f" % (x, y) for x, y in pts)


class Ant:
    def __init__(self, **k):
        d = dict(hw=13, hh=12, eye=1.6, mand="tooth", ml=6, ms=20, mh=11,
                 arch=2.5, spines=0, nodes=2, gx=11, gy=9, gtype="oval",
                 sting=True, acid=False, leg=1.0, wing=False, hi="none",
                 fossil=False, stalk=False, fuzz=False, horn=False,
                 pale=False, mm="")
        d.update(k)
        d["hw"] *= 1.14
        d["hh"] *= 1.14
        d["gx"] *= 0.94
        self.__dict__.update(d)

    # -- helpers -------------------------------------------------------
    def cls(self, part):
        return "hl" if self.hi == part else "ln"

    def build(self):
        o = []
        hi = self.hi
        waist = 7.0 if self.nodes == 1 else 11.0
        ps = GF - waist                      # petiole start / mesosoma rear
        mf = ps - self.ms                    # mesosoma front
        hx = mf - self.hw / 2.0 - 1.5        # head centre
        mtop = BASE - self.mh / 2.0
        mbot = BASE + self.mh / 2.0
        gcx = GF + self.gx
        gcy = BASE + (2.0 if self.gtype in ("replete", "physo") else 0.0)

        minx = hx - self.hw / 2.0 - self.ml - 4
        maxx = gcx + self.gx + 3

        # ---- far legs (depth) ----
        o.append('<g class="far">')
        o += self._legs(mf, ps, mbot, 2.2, 0.86)
        o.append("</g>")

        # ---- antenna ----
        ax = hx - self.hw * 0.30
        ay = BASE - self.hh * 0.28
        sc = (ax - 13.5, ay - 10.5)
        fu = (sc[0] - 12.5, sc[1] + 3.5)
        o.append('<line class="ln scape" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'
                 % (ax, ay, sc[0], sc[1]))
        o.append('<line class="ln thin" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'
                 % (sc[0], sc[1], fu[0], fu[1]))
        o.append('<circle class="joint" cx="%.1f" cy="%.1f" r="1.1"/>' % (sc[0], sc[1]))
        minx = min(minx, fu[0] - 2)

        # ---- gaster ----
        gc = self.cls("gaster")
        if self.gtype == "replete":
            o.append('<circle class="%s" cx="%.1f" cy="%.1f" r="%.1f"/>'
                     % (gc, gcx, gcy, self.gy))
            for i in (-0.45, 0.0, 0.45):
                r = self.gy
                o.append('<path class="ln thin" d="M %.1f %.1f A %.1f %.1f 0 0 1 %.1f %.1f"/>'
                         % (gcx + r * math.sin(i) - 0.2, gcy - r * math.cos(i) * 0.97,
                            r * 1.25, r * 1.25,
                            gcx + r * math.sin(i) + 0.2, gcy + r * math.cos(i) * 0.97))
        elif self.gtype == "disc":
            o.append('<ellipse class="%s" cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f"/>'
                     % (gc, gcx, gcy, self.gx, self.gy))
            o.append('<ellipse class="ln thin" cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f" fill="none"/>'
                     % (gcx, gcy, self.gx * 0.66, self.gy * 0.6))
        elif self.gtype == "heart":
            o.append('<path class="%s" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f Q %.1f %.1f %.1f %.1f Z"/>'
                     % (gc, GF, BASE + 1,
                        GF + self.gx * 0.5, BASE - self.gy - 3,
                        gcx + self.gx * 0.9, BASE - self.gy - 5,
                        GF + self.gx * 0.7, BASE + self.gy - 1,
                        GF, BASE + 1))
        elif self.gtype == "burst":
            o.append('<ellipse class="%s" cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f"/>'
                     % (gc, gcx, gcy, self.gx, self.gy))
            for a in range(0, 360, 45):
                r = math.radians(a)
                o.append('<line class="hl thin" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'
                         % (gcx + math.cos(r) * (self.gx + 1.5),
                            gcy + math.sin(r) * (self.gy + 1.5),
                            gcx + math.cos(r) * (self.gx + 6),
                            gcy + math.sin(r) * (self.gy + 6)))
            maxx += 5
        elif self.gtype == "physo":
            o.append('<ellipse class="%s" cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f"/>'
                     % (gc, gcx, gcy, self.gx, self.gy))
            for f in (-0.35, 0.1, 0.55):
                o.append('<line class="ln thin" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'
                         % (gcx + self.gx * f, gcy - self.gy * 0.82,
                            gcx + self.gx * f, gcy + self.gy * 0.82))
        else:
            o.append('<ellipse class="%s" cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f"/>'
                     % (gc, gcx, gcy, self.gx, self.gy))

        # sting / acidopore
        tipx = gcx + self.gx
        if self.sting:
            o.append('<polyline class="ln" points="%s"/>'
                     % _p([(tipx - 1, gcy + 1.5), (tipx + 5.5, gcy + 4.5)]))
            maxx = max(maxx, tipx + 7)
        if self.acid:
            o.append('<circle class="ln" cx="%.1f" cy="%.1f" r="1.7"/>' % (tipx + 1.2, gcy + 2))

        # ---- petiole ----
        if self.nodes == 1:
            o.append('<path class="ln" d="M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z"/>'
                     % (ps, BASE + 2.5, ps + 1.2, BASE - 5.5,
                        ps + 4.6, BASE - 5.5, ps + 6.4, BASE + 2.5))
        else:
            o.append('<path class="ln" d="M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z"/>'
                     % (ps, BASE + 2.5, ps + 0.8, BASE - 4.5,
                        ps + 3.2, BASE - 4.5, ps + 4.4, BASE + 2.5))
            o.append('<ellipse class="ln" cx="%.1f" cy="%.1f" rx="2.7" ry="3.4"/>'
                     % (ps + 7.6, BASE - 0.4))

        # ---- mesosoma ----
        mc = self.cls("meso")
        M = self.ms
        o.append('<path class="%s" d="M %.1f %.1f L %.1f %.1f Q %.1f %.1f %.1f %.1f '
                 'Q %.1f %.1f %.1f %.1f Q %.1f %.1f %.1f %.1f L %.1f %.1f '
                 'Q %.1f %.1f %.1f %.1f Z"/>'
                 % (mc,
                    mf, BASE + 2.5,
                    mf, BASE - self.mh * 0.18,
                    mf + M * 0.16, mtop - self.arch, mf + M * 0.38, mtop - self.arch * 0.35,
                    mf + M * 0.52, mtop + 3.2, mf + M * 0.63, mtop + 2.2,
                    mf + M * 0.82, mtop + 0.4, ps, mtop + 3.4,
                    ps, mbot - 2.0,
                    mf + M * 0.45, mbot + 1.4, mf, BASE + 2.5))

        # propodeal / petiolar spines
        if self.spines:
            sc_ = self.cls("spine") if self.hi == "spine" else "hl"
            for i in range(self.spines):
                bx = ps - 3.5 - i * 4.5
                o.append('<polyline class="%s" points="%s"/>'
                         % (sc_, _p([(bx, mtop + 0.5), (bx + 2.5, mtop - 7.5), (bx + 3.6, mtop + 0.2)])))
            o.append('<polyline class="%s" points="%s"/>'
                     % (sc_, _p([(ps + 0.6, BASE - 4.4), (ps + 2.0, BASE - 9.5), (ps + 3.4, BASE - 4.4)])))

        # wing
        if self.wing:
            wc = self.cls("wing")
            o.append('<path class="%s soft" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f Q %.1f %.1f %.1f %.1f Z"/>'
                     % (wc, mf + 3, mtop - 1,
                        mf + 14, mtop - 17, gcx + self.gx - 2, mtop - 9,
                        mf + 20, mtop + 1, mf + 3, mtop - 1))

        # ---- head ----
        hc = self.cls("head")
        o.append('<ellipse class="%s" cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f"/>'
                 % (hc, hx, BASE, self.hw / 2, self.hh / 2))
        if self.mand == "plug":
            o.append('<path class="%s" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f L %.1f %.1f '
                     'Q %.1f %.1f %.1f %.1f Z"/>'
                     % (hc, hx - self.hw * 0.30, BASE - self.hh * 0.47,
                        hx - self.hw * 0.60, BASE - self.hh * 0.34,
                        hx - self.hw * 0.60, BASE,
                        hx - self.hw * 0.60, BASE + self.hh * 0.34,
                        hx - self.hw * 0.60, BASE + self.hh * 0.47,
                        hx - self.hw * 0.30, BASE + self.hh * 0.47))
        if self.hw > 19:
            o.append('<path class="ln thin" fill="none" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f"/>'
                     % (hx + self.hw * 0.34, BASE - self.hh * 0.30,
                        hx + self.hw * 0.16, BASE, hx + self.hw * 0.34, BASE + self.hh * 0.30))
        if self.eye > 0:
            o.append('<ellipse class="eye" cx="%.1f" cy="%.1f" rx="%.1f" ry="%.1f"/>'
                     % (hx + self.hw * 0.06, BASE - self.hh * 0.13,
                        self.eye, self.eye * 1.25))

        # ---- mandibles ----
        o += self._mandibles(hx, minx)

        if self.horn:
            o.append('<polyline class="hl" points="%s"/>'
                     % _p([(hx - self.hw / 2 + 1, BASE - self.hh * 0.36),
                           (hx - self.hw / 2 - 7, BASE - self.hh * 0.30),
                           (hx - self.hw / 2 + 1, BASE - self.hh * 0.05)]))

        if self.stalk:
            o.append('<path class="hl blade" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f"/>'
                     % (hx, BASE - self.hh / 2, hx - 8, BASE - 22, hx + 1, BASE - 31))
            o.append('<ellipse class="hl" cx="%.1f" cy="%.1f" rx="3.0" ry="5.2"/>'
                     % (hx + 1.6, BASE - 34))

        # ---- near legs ----
        o += self._legs(mf, ps, mbot, 0.0, 1.0)

        if self.fuzz:
            for (ex, ey, rx, ry, n) in ((gcx, gcy, self.gx, self.gy, 22),
                                        (mf + self.ms * 0.5, BASE, self.ms * 0.42, self.mh * 0.5, 14),
                                        (hx, BASE, self.hw * 0.5, self.hh * 0.5, 10)):
                for i in range(n):
                    a = i / float(n) * math.tau
                    cx = ex + math.cos(a) * (rx + 0.4)
                    cy = ey + math.sin(a) * (ry + 0.4)
                    o.append('<line class="hair" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'
                             % (cx, cy, cx + math.cos(a) * 2.4, cy + math.sin(a) * 2.4))
            maxx += 3

        w = maxx - minx + 8
        vb = "%.1f -6 %.1f 66" % (minx - 4, w)
        body = "".join(o)
        cl = "ant fossil" if self.fossil else "ant"
        return ('<svg class="%s" viewBox="%s" preserveAspectRatio="xMidYMid meet" '
                'aria-hidden="true">%s</svg>' % (cl, vb, body))

    # -- sub-builders --------------------------------------------------
    def _legs(self, mf, ps, mbot, off, k):
        out = []
        L = self.leg
        far = off != 0
        specs = [(mf + 3.5, -12 * L, 7 * L, -7 * L, 11 * L, -4 * L, 4 * L),
                 (mf + self.ms * 0.48, -3 * L, 10 * L, -3 * L, 13 * L, -3.5 * L, 4 * L),
                 (ps - 2.5, 9 * L, 8 * L, 7 * L, 12 * L, 5 * L, 4 * L)]
        for (x0, fx, fy, tx, ty, sx, sy) in specs:
            x0 += off
            y0 = mbot - 1.5 - (1.5 if far else 0)
            knee = (x0 + fx, y0 + fy)
            ankle = (knee[0] + tx, knee[1] + ty * k)
            foot = (ankle[0] + sx, ankle[1] + sy * k)
            if far:
                cls = "far-l"
            elif self.hi == "leg":
                cls = "hl thin"
            else:
                cls = "ln thin"
            out.append('<polyline class="%s" points="%s"/>'
                       % (cls, _p([(x0, y0), knee, ankle, foot])))
        return out

    def _mandibles(self, hx, minx):
        t, ml = self.mand, self.ml
        c = "hl" if self.hi == "mand" else "ln"
        x = hx - self.hw / 2 + 1.5
        y = BASE + self.hh * 0.16
        o = []

        if t in ("small", "tooth"):
            # lateral view: one blade, curving down and forward
            tip = (x - ml, y + ml * 0.42)
            o.append('<path class="%s" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f '
                     'Q %.1f %.1f %.1f %.1f Z"/>'
                     % (c, x, y - 2.6,
                        x - ml * 0.75, y - 0.4, tip[0], tip[1],
                        x - ml * 0.42, y + 0.6, x, y + 2.4))
            if t == "tooth":
                for f in (0.42, 0.66):
                    o.append('<line class="ln hair" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'
                             % (x - ml * f, y + ml * f * 0.30,
                                x - ml * f - 0.6, y + ml * f * 0.30 + 2.4))
        elif t == "plug":
            o.append('<path class="%s" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f Q %.1f %.1f %.1f %.1f Z"/>'
                     % (c, x, y - 1.8, x - ml * 0.8, y + 0.4, x - ml, y + ml * 0.5,
                        x - ml * 0.4, y + 0.8, x, y + 1.8))
        elif t == "trap":
            for s in (-1, 1):
                o.append('<path class="%s" d="M %.1f %.1f L %.1f %.1f L %.1f %.1f L %.1f %.1f Z"/>'
                         % (c, x, y + s * 2.0,
                            x - ml, y + s * (ml * 0.50),
                            x - ml - 1.0, y + s * (ml * 0.50) + s * 2.2,
                            x - 0.5, y + s * 4.4))
                o.append('<line class="ln hair" x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f"/>'
                         % (x - ml * 0.92, y + s * (ml * 0.46),
                            x - ml * 0.92, y + s * (ml * 0.46) + s * 3.0))
        elif t == "snap":
            for s in (-1, 1):
                o.append('<path class="%s" d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z"/>'
                         % (c, x, y + s * 3.0,
                            x - ml, y + s * 0.6,
                            x - ml * 0.85, y + s * 3.4))
            o.append('<circle class="hl" cx="%.1f" cy="%.1f" r="1.8"/>' % (x - ml - 1.0, y))
        elif t == "sickle":
            for s in (-1, 1):
                o.append('<path class="%s blade" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f"/>'
                         % (c, x, y + s * 3.0,
                            x - ml * 0.78, y + s * (ml * 0.60),
                            x - ml, y - s * 1.6))
        elif t == "nut":
            for s in (-1, 1):
                o.append('<path class="%s" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f '
                         'Q %.1f %.1f %.1f %.1f Z"/>'
                         % (c, x, y + s * 3.4,
                            x - ml * 0.95, y + s * (ml * 0.78), x - ml * 0.45, y + s * 1.2,
                            x - ml * 0.55, y + s * (ml * 0.40), x, y + s * 1.0))
        elif t == "forceps":
            for s in (-1, 1):
                o.append('<path class="%s" d="M %.1f %.1f L %.1f %.1f L %.1f %.1f Z"/>'
                         % (c, x, y + s * 2.2,
                            x - ml, y + s * 3.2,
                            x - ml * 0.55, y + s * 0.4))
        elif t == "scythe":
            for s in (-1, 1):
                o.append('<path class="%s" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f '
                         'Q %.1f %.1f %.1f %.1f Z"/>'
                         % (c, x, y + s * 2.4,
                            x - ml * 0.95, y + s * 1.4,
                            x - ml * 0.78, BASE - self.hh * 0.58,
                            x - ml * 0.55, y - s * 0.4, x, y + s * 0.4))
        else:  # massive
            for s in (-1, 1):
                o.append('<path class="%s" d="M %.1f %.1f Q %.1f %.1f %.1f %.1f '
                         'Q %.1f %.1f %.1f %.1f Z"/>'
                         % (c, x, y + s * 4.2,
                            x - ml * 0.85, y + s * (ml * 0.72), x - ml, y + s * 1.0,
                            x - ml * 0.45, y + s * 0.4, x, y + s * 0.8))
        return o


SPECS = {
 "a1":  Ant(mm="13 mm soldier", hw=17, hh=15, eye=0, mand="sickle", ml=13, ms=21, mh=12, nodes=1, gx=13, gy=9.5, sting=False, hi="mand"),
 "a2":  Ant(mm="12 mm soldier", hw=14, hh=13, eye=0, mand="sickle", ml=14, ms=21, mh=11, nodes=2, gx=12, gy=8.5, sting=False, hi="mand"),
 "a3":  Ant(mm="2–6 mm", hw=10, hh=9.5, eye=1.2, mand="tooth", ml=5, ms=17, mh=9, nodes=2, gx=10, gy=8, hi="gaster"),
 "a4":  Ant(mm="up to 16 mm", hw=22, hh=19, eye=1.5, mand="massive", ml=10, ms=20, mh=12, spines=2, nodes=2, gx=10.5, gy=8.5, sting=False, hi="head"),
 "a5":  Ant(mm="~8 mm", hw=12, hh=11, eye=0, mand="tooth", ml=7, ms=20, mh=10, nodes=1, gx=11, gy=8, hi="none"),
 "a6":  Ant(mm="16 mm major", hw=24, hh=21, eye=1.0, mand="massive", ml=9, ms=18, mh=11, nodes=2, gx=10, gy=8, hi="head"),
 "a7":  Ant(mm="8–10 mm", hw=11, hh=10, eye=2.4, mand="tooth", ml=6, ms=24, mh=9, nodes=1, gx=11, gy=7.5, sting=False, acid=True, leg=1.35, hi="none"),
 "a8":  Ant(mm="3.5 mm soldier", hw=23, hh=20, eye=1.1, mand="massive", ml=8, ms=16, mh=10, nodes=2, gx=9.5, gy=8, hi="head"),
 "a9":  Ant(mm="2.6 mm", hw=9, hh=8.5, eye=1.4, mand="small", ml=4, ms=15, mh=8, nodes=1, gx=9.5, gy=7, sting=False, hi="none"),
 "a10": Ant(mm="4–5 mm", hw=9.5, hh=9, eye=2.0, mand="small", ml=4.5, ms=19, mh=8, nodes=1, gx=10, gy=7, sting=False, acid=True, leg=1.5, hi="none"),
 "a11": Ant(mm="up to 40 mm", hw=16, hh=14, eye=4.2, mand="tooth", ml=13, ms=22, mh=12, nodes=2, gx=12.5, gy=10, hi="head"),
 "a12": Ant(mm="18–30 mm", hw=15, hh=13.5, eye=2.4, mand="tooth", ml=9, ms=23, mh=12, nodes=1, gx=13, gy=10, hi="gaster"),
 "a13": Ant(mm="up to 18 mm", hw=14, hh=12.5, eye=2.0, mand="tooth", ml=8, ms=21, mh=11, nodes=1, gx=11.5, gy=9, hi="none"),
 "a14": Ant(mm="30–40 mm", hw=17, hh=15, eye=2.6, mand="tooth", ml=11, ms=24, mh=13, nodes=1, gx=14, gy=10.5, hi="none"),
 "a15": Ant(mm="8–12 mm", hw=13, hh=11, eye=2.8, mand="trap", ml=15, ms=21, mh=10, nodes=1, gx=11, gy=8.5, hi="mand"),
 "a16": Ant(mm="~12 mm", hw=13, hh=11.5, eye=3.8, mand="tooth", ml=9, ms=20, mh=11, nodes=2, gx=11, gy=9, hi="gaster"),
 "a17": Ant(mm="5–10 mm", hw=15, hh=13, eye=1.8, mand="massive", ml=7, ms=18, mh=11, nodes=2, gx=11, gy=9, hi="gaster"),
 "a18": Ant(mm="~25 mm", hw=15, hh=13, eye=4.0, mand="tooth", ml=12, ms=21, mh=12, nodes=2, gx=12, gy=9.5, hi="none"),
 "a19": Ant(mm="1.5 mm", hw=8.5, hh=8, eye=1.2, mand="small", ml=4, ms=15, mh=8, spines=1, nodes=2, gx=9, gy=7, hi="gaster"),
 "a20": Ant(mm="15–20 mm", hw=16, hh=14, eye=1.6, mand="nut", ml=12, ms=21, mh=11, nodes=1, gx=12, gy=9.5, hi="mand"),
 "a21": Ant(mm="up to 20 mm", hw=13, hh=11, eye=4.4, mand="forceps", ml=12, ms=21, mh=10, nodes=1, gx=12, gy=9, leg=1.4, hi="leg"),
 "a22": Ant(mm="~5 mm", hw=12, hh=10, eye=0.9, mand="snap", ml=13, ms=18, mh=9, nodes=1, gx=10, gy=7.5, hi="mand"),
 "a23": Ant(mm="4.5–9 mm", hw=12, hh=10.5, eye=2.0, mand="tooth", ml=6, ms=20, mh=10, nodes=1, gx=11, gy=8.5, sting=False, acid=True, hi="gaster"),
 "a24": Ant(mm="up to 17 mm", hw=17, hh=14, eye=2.2, mand="massive", ml=8, ms=23, mh=13, arch=4.5, nodes=1, gx=13, gy=10, sting=False, acid=True, hi="none"),
 "a25": Ant(mm="~6 mm", hw=12, hh=11, eye=1.6, mand="plug", ml=5, ms=17, mh=9, nodes=1, gx=9.5, gy=8, gtype="burst", sting=False, hi="gaster"),
 "a26": Ant(mm="~5 mm", hw=9.5, hh=8.5, eye=3.2, mand="small", ml=4.5, ms=19, mh=8, nodes=2, gx=10, gy=7, hi="gaster"),
 "a27": Ant(mm="~3 mm", hw=9, hh=8, eye=1.4, mand="small", ml=4, ms=16, mh=8, spines=1, nodes=2, gx=9, gy=6.5, gtype="heart", hi="gaster"),
 "a28": Ant(mm="~10 mm", hw=11, hh=9.5, eye=2.6, mand="tooth", ml=6, ms=20, mh=9, nodes=1, gx=10.5, gy=8, sting=False, acid=True, leg=1.6, hi="leg"),
 "a29": Ant(mm="~12 mm", hw=13, hh=11, eye=2.2, mand="tooth", ml=7, ms=21, mh=10, nodes=1, gx=11.5, gy=8.5, hi="meso"),
 "a30": Ant(mm="~2.5 mm male", hw=10.5, hh=9, eye=1.6, mand="sickle", ml=10, ms=15, mh=8, nodes=2, gx=9, gy=6.5, hi="mand"),
 "a31": Ant(mm="~6 mm", hw=11, hh=10, eye=2.0, mand="sickle", ml=11, ms=18, mh=9, nodes=1, gx=10, gy=8, hi="mand"),
 "a32": Ant(mm="up to 14 mm", hw=20, hh=17, eye=1.6, mand="massive", ml=9, ms=18, mh=11, nodes=2, gx=10.5, gy=8.5, hi="head"),
 "a33": Ant(mm="replete to 14 mm", hw=11, hh=10, eye=1.8, mand="small", ml=5, ms=17, mh=9, nodes=1, gx=13, gy=13, gtype="replete", sting=False, acid=True, hi="gaster"),
 "a34": Ant(mm="~14 mm", hw=15, hh=13, eye=2.0, mand="plug", ml=5, ms=19, mh=10, spines=2, nodes=2, gx=12, gy=6.5, gtype="disc", hi="head"),
 "a35": Ant(mm="~7 mm", hw=11, hh=10, eye=2.0, mand="small", ml=5, ms=19, mh=9, spines=2, nodes=1, gx=10.5, gy=8, sting=False, acid=True, hi="spine"),
 "a36": Ant(mm="~2 mm", hw=8.5, hh=8, eye=1.2, mand="small", ml=4, ms=15, mh=8, nodes=1, gx=9, gy=7, sting=False, acid=True, hi="gaster"),
 "a37": Ant(mm="~3 mm", hw=10, hh=9, eye=1.4, mand="tooth", ml=5, ms=16, mh=9, nodes=2, gx=9.5, gy=7.5, hi="none"),
 "a38": Ant(mm="queen 20–25 mm", hw=13, hh=12, eye=2.6, mand="tooth", ml=6, ms=22, mh=13, arch=4, nodes=2, gx=15, gy=11, wing=True, hi="wing"),
 "a39": Ant(mm="3–5 mm", hw=10, hh=9, eye=1.6, mand="tooth", ml=5, ms=17, mh=9, nodes=1, gx=10, gy=7.5, sting=False, acid=True, hi="none"),
 "a40": Ant(mm="~2 mm", hw=9.5, hh=9, eye=0, mand="small", ml=4, ms=14, mh=9, nodes=2, gx=9, gy=7.5, sting=False, leg=0.64, hi="leg"),
 "a41": Ant(mm="~10 mm", hw=13, hh=11, eye=2.0, mand="tooth", ml=6, ms=21, mh=11, nodes=1, gx=11.5, gy=9, sting=False, acid=True, stalk=True, hi="none"),
 "a42": Ant(mm="2 mm", hw=8.5, hh=8, eye=1.1, mand="small", ml=4, ms=15, mh=8, nodes=2, gx=9, gy=7, hi="none"),
 "a43": Ant(mm="~6 mm", hw=12, hh=10, eye=1.2, mand="tooth", ml=5, ms=17, mh=10, nodes=2, gx=10, gy=8, fuzz=True, leg=0.8, hi="none"),
 "a44": Ant(mm="~5 mm · 99 Ma", hw=12, hh=10.5, eye=1.4, mand="scythe", ml=11, ms=18, mh=9, nodes=1, gx=10, gy=8, horn=True, fossil=True, hi="mand"),
 "a45": Ant(mm="queen 5 cm", hw=16, hh=14, eye=3.0, mand="tooth", ml=7, ms=25, mh=15, arch=5, nodes=1, gx=17, gy=12, wing=True, fossil=True, sting=False, hi="wing"),
 "a46": Ant(mm="~12 mm", hw=12, hh=10.5, eye=3.6, mand="tooth", ml=8, ms=21, mh=10, nodes=2, gx=11.5, gy=8.5, pale=True, hi="none"),
 "a47": Ant(mm="2–3 mm", hw=9.5, hh=8, eye=0, mand="forceps", ml=10, ms=17, mh=8, nodes=1, gx=9.5, gy=7, pale=True, hi="mand"),
 "a48": Ant(mm="~2.5 mm", hw=9, hh=8, eye=1.4, mand="small", ml=4, ms=15, mh=8, nodes=1, gx=9, gy=7, sting=False, hi="none"),
 "a49": Ant(mm="queen ~10 mm", hw=12, hh=10.5, eye=2.6, mand="small", ml=4.5, ms=21, mh=12, arch=4, nodes=2, gx=13, gy=10, wing=True, sting=False, hi="wing"),
 "a50": Ant(mm="queen ~2.5 mm", hw=9, hh=8, eye=1.6, mand="small", ml=3.5, ms=15, mh=8, nodes=2, gx=12, gy=9.5, gtype="physo", sting=False, hi="gaster"),
}

SVGS = {k: v.build() for k, v in SPECS.items()}

if __name__ == "__main__":
    import re, sys
    # contact sheet for visual check
    cols, cw, ch = 5, 200, 132
    rows = (len(SPECS) + cols - 1) // cols
    cells = []
    for i, k in enumerate(sorted(SPECS, key=lambda s: int(s[1:]))):
        cx, cy = (i % cols) * cw, (i // cols) * ch
        inner = SVGS[k].replace('<svg class="ant', '<svg class="ant', 1)
        inner = re.sub(r'^<svg ', '<svg x="%d" y="%d" width="%d" height="%d" ' % (cx, cy + 12, cw, ch - 26), inner)
        cells.append('<text x="%d" y="%d" class="lbl">%s %s</text>%s'
                     % (cx + 6, cy + 12, k[1:], SPECS[k].mm, inner))
    sheet = ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">'
             '<rect width="100%%" height="100%%" fill="#E7E8E1"/>'
             '<style>.ln{fill:#F4F4EF;stroke:#17150F;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}'
             '.hl{fill:#C9AC12;stroke:#17150F;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}'
             '.thin{fill:none;stroke-width:1.7}.hl.thin{fill:none;stroke:#8A7508;stroke-width:2}''.hair{stroke-width:1.1;fill:none;stroke:#17150F;opacity:.75}''.scape{stroke-width:2.2;fill:none}.blade{fill:none;stroke-width:2.6}''.hl.blade{stroke:#8A7508}''.joint{fill:#17150F;stroke:none}'
             '.far-l{fill:none;stroke:#17150F;stroke-width:1.5;opacity:.28}'
             '.eye{fill:#17150F;stroke:none}.soft{opacity:.55}'
             '.lbl{font:11px monospace;fill:#625F52}</style>%s</svg>'
             % (cols * cw, rows * ch, cols * cw, rows * ch, "".join(cells)))
    open("sheet.svg", "w").write(sheet)
    import cairosvg
    cairosvg.svg2png(url="sheet.svg", write_to="sheet.png", output_width=cols * cw, output_height=rows * ch)
    print("wrote sheet.png  (%d ants)" % len(SPECS))
