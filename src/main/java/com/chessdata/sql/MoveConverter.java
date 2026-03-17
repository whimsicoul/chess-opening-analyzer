package com.chessdata.sql;

import java.util.ArrayList;
import java.util.List;

public class MoveConverter {

    public List<String> convertToUCI(List<String> sanMoves) {
        List<String> uciMoves = new ArrayList<>();

        for (String move : sanMoves) {
            // TEMP: just return the same move
            // This is a placeholder until you implement real conversion
            uciMoves.add(move);
        }

        return uciMoves;
    }
}