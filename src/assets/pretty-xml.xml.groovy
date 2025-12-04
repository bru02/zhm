import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFileFactory
import com.intellij.psi.codeStyle.CodeStyleManager
import com.intellij.psi.impl.source.SourceTreeToPsiMap

/*
 * Available context bindings:
 *   COLUMNS     List<DataColumn>
 *   ROWS        Iterable<DataRow>
 *   OUT         { append() }
 *   FORMATTER   { format(row, col); formatValue(Object, col); getTypeName(Object, col); isStringLiteral(Object, col); }
 *   TRANSPOSED  Boolean
 * plus ALL_COLUMNS, TABLE, DIALECT
 *
 * where:
 *   DataRow     { rowNumber(); first(); last(); data(): List<Object>; value(column): Object }
 *   DataColumn  { columnNumber(), name() }
 */

def result = new StringBuilder()

ROWS.each { row ->
  COLUMNS.each { column ->
    def value = row.value(column)
    def stringValue = FORMATTER.formatValue(value, column)
    result.append(stringValue)
  }
}

CodeStyleManager styleManager = CodeStyleManager.getInstance(PROJECT);
PsiElement psiFile = PsiFileFactory.getInstance(PROJECT).createFileFromText("a.xml", result.toString());
styleManager.reformatText(psiFile, [psiFile.getTextRange()]);
OUT.append(psiFile.text)

