from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

from flask import Flask, jsonify, request, send_from_directory


@dataclass
class State:
    id: int
    length: int = 0
    link: int = -1
    transitions: Dict[str, int] = field(default_factory=dict)


class SuffixAutomaton:
    def __init__(self) -> None:
        self.states: List[State] = [State(id=0)]
        self.last = 0

    def extend(self, ch: str) -> None:
        cur = len(self.states)
        self.states.append(State(id=cur, length=self.states[self.last].length + 1))

        p = self.last
        while p >= 0 and ch not in self.states[p].transitions:
            self.states[p].transitions[ch] = cur
            p = self.states[p].link

        if p == -1:
            self.states[cur].link = 0
        else:
            q = self.states[p].transitions[ch]
            if self.states[p].length + 1 == self.states[q].length:
                self.states[cur].link = q
            else:
                clone = len(self.states)
                self.states.append(
                    State(
                        id=clone,
                        length=self.states[p].length + 1,
                        link=self.states[q].link,
                        transitions=self.states[q].transitions.copy(),
                    )
                )
                while p >= 0 and self.states[p].transitions.get(ch) == q:
                    self.states[p].transitions[ch] = clone
                    p = self.states[p].link
                self.states[q].link = clone
                self.states[cur].link = clone

        self.last = cur

    def extend_with_trace(self, ch: str, char_index: int, trace_steps: List[Dict[str, object]]) -> None:
        prev_last = self.last
        cur = len(self.states)
        self.states.append(State(id=cur, length=self.states[self.last].length + 1))
        self._push_build_step(
            trace_steps,
            char_index,
            ch,
            "Создали новое состояние",
            f"Добавили q{cur} для символа '{ch}', len={self.states[cur].length}.",
            active_state=cur,
        )

        p = self.last
        while p >= 0 and ch not in self.states[p].transitions:
            self.states[p].transitions[ch] = cur
            self._push_build_step(
                trace_steps,
                char_index,
                ch,
                "Добавили переход",
                f"Из q{p} добавлен переход '{ch}' → q{cur}.",
                active_state=cur,
            )
            p = self.states[p].link

        if p == -1:
            self.states[cur].link = 0
            self._push_build_step(
                trace_steps,
                char_index,
                ch,
                "Установили суффиксную ссылку",
                f"Дошли до фиктивного предка. Для q{cur} суффиксная ссылка: q0.",
                active_state=cur,
            )
        else:
            q = self.states[p].transitions[ch]
            if self.states[p].length + 1 == self.states[q].length:
                self.states[cur].link = q
                self._push_build_step(
                    trace_steps,
                    char_index,
                    ch,
                    "Установили суффиксную ссылку",
                    f"Без клона: suffix-link(q{cur}) = q{q}.",
                    active_state=cur,
                )
            else:
                clone = len(self.states)
                self.states.append(
                    State(
                        id=clone,
                        length=self.states[p].length + 1,
                        link=self.states[q].link,
                        transitions=self.states[q].transitions.copy(),
                    )
                )
                self._push_build_step(
                    trace_steps,
                    char_index,
                    ch,
                    "Создали клон",
                    f"Создали q{clone} как клон q{q}: len={self.states[clone].length}, link=q{self.states[clone].link}.",
                    active_state=clone,
                )
                while p >= 0 and self.states[p].transitions.get(ch) == q:
                    self.states[p].transitions[ch] = clone
                    self._push_build_step(
                        trace_steps,
                        char_index,
                        ch,
                        "Перенаправили переход",
                        f"В q{p} переход '{ch}' перенаправлен с q{q} на q{clone}.",
                        active_state=clone,
                    )
                    p = self.states[p].link
                self.states[q].link = clone
                self.states[cur].link = clone
                self._push_build_step(
                    trace_steps,
                    char_index,
                    ch,
                    "Обновили суффиксные ссылки",
                    f"suffix-link(q{q}) и suffix-link(q{cur}) теперь ведут в q{clone}.",
                    active_state=cur,
                )

        self.last = cur
        self._push_build_step(
            trace_steps,
            char_index,
            ch,
            "Завершили обработку символа",
            f"last перемещён: q{prev_last} → q{self.last}.",
            active_state=self.last,
        )

    @classmethod
    def from_string(cls, s: str) -> "SuffixAutomaton":
        sam = cls()
        for ch in s:
            sam.extend(ch)
        return sam

    @classmethod
    def from_string_with_trace(cls, s: str) -> tuple["SuffixAutomaton", List[Dict[str, object]]]:
        sam = cls()
        steps: List[Dict[str, object]] = []
        for idx, ch in enumerate(s):
            sam.extend_with_trace(ch, idx, steps)
        return sam, steps

    def to_graph(self) -> Dict[str, List[Dict[str, object]]]:
        nodes = [
            {
                "id": st.id,
                "label": f"q{st.id}",
                "length": st.length,
                "link": st.link,
                "isTerminal": self._is_terminal(st.id),
            }
            for st in self.states
        ]

        edges = []
        for st in self.states:
            for ch, to in st.transitions.items():
                edges.append({"from": st.id, "to": to, "char": ch})

        suffix_links = [
            {"from": st.id, "to": st.link}
            for st in self.states
            if st.link >= 0 and st.id != 0
        ]

        return {"nodes": nodes, "edges": edges, "suffixLinks": suffix_links}

    def _is_terminal(self, state_id: int) -> bool:
        cur = self.last
        while cur > 0:
            if cur == state_id:
                return True
            cur = self.states[cur].link
        return state_id == 0

    def _push_build_step(
        self,
        trace_steps: List[Dict[str, object]],
        char_index: int,
        ch: str,
        action: str,
        explanation: str,
        active_state: int,
    ) -> None:
        trace_steps.append(
            {
                "step": len(trace_steps) + 1,
                "charIndex": char_index,
                "char": ch,
                "action": action,
                "explanation": explanation,
                "activeState": active_state,
                "statesCount": len(self.states),
                "graph": self.to_graph(),
            }
        )

    def traverse_lcs(self, t: str) -> Dict[str, object]:
        v = 0
        l = 0
        best_len = 0
        best_pos = -1
        steps: List[Dict[str, object]] = []

        for i, ch in enumerate(t):
            while v != 0 and ch not in self.states[v].transitions:
                v = self.states[v].link
                l = self.states[v].length

            if ch in self.states[v].transitions:
                v = self.states[v].transitions[ch]
                l += 1
            else:
                v = 0
                l = 0

            if l > best_len:
                best_len = l
                best_pos = i

            steps.append(
                {
                    "index": i,
                    "char": ch,
                    "state": v,
                    "currentLength": l,
                    "currentSubstring": t[i - l + 1 : i + 1] if l > 0 else "",
                    "bestLength": best_len,
                    "bestSubstring": t[best_pos - best_len + 1 : best_pos + 1] if best_len > 0 else "",
                }
            )

        lcs = t[best_pos - best_len + 1 : best_pos + 1] if best_len > 0 else ""
        return {"lcs": lcs, "length": best_len, "steps": steps}


app = Flask(__name__, static_folder="static")


@app.get("/")
def index() -> object:
    return send_from_directory("static", "index.html")


@app.post("/api/build")
def build_automaton() -> object:
    payload = request.get_json(silent=True) or {}
    source = str(payload.get("source", ""))

    if not source:
        return jsonify({"error": "Введите исходную строку."}), 400

    sam = SuffixAutomaton.from_string(source)
    return jsonify({"source": source, "graph": sam.to_graph()})


@app.post("/api/build-steps")
def build_automaton_steps() -> object:
    payload = request.get_json(silent=True) or {}
    source = str(payload.get("source", ""))

    if not source:
        return jsonify({"error": "Введите исходную строку."}), 400

    sam, steps = SuffixAutomaton.from_string_with_trace(source)
    return jsonify({"source": source, "graph": sam.to_graph(), "steps": steps})


@app.post("/api/lcs")
def run_lcs() -> object:
    payload = request.get_json(silent=True) or {}
    source = str(payload.get("source", ""))
    target = str(payload.get("target", ""))

    if not source or not target:
        return jsonify({"error": "Нужно заполнить обе строки."}), 400

    sam = SuffixAutomaton.from_string(source)
    result = sam.traverse_lcs(target)
    result["graph"] = sam.to_graph()
    result["source"] = source
    result["target"] = target
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)
